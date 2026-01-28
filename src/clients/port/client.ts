import axios from "axios";
import type { Logger } from "pino";
import { getPortEnv } from "../../env";
import { getLogger } from "../../logger";
import {
  TOKEN_EXPIRY_BUFFER_MS,
  BEARER_TOKEN_DEFAULT_EXPIRY_MS,
  PORT_BATCH_SIZE,
} from "../../constants";
import type {
  OAuthResponse,
  PortEntitiesResponse,
  PortEntity,
  PortEntityResponse,
  PortBulkEntitiesRequest,
  PortBulkEntitiesResponse,
} from "./types";

/**
 * PortClient class for interacting with Port API
 * Handles token management, validation, and regeneration
 */
export class PortClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiryTime: number | null = null;
  private clientId: string;
  private clientSecret: string;
  private static instance: PortClient | null = null;
  private logger: Logger;

  private constructor() {
    const portEnv = getPortEnv();
    this.baseUrl = portEnv.portBaseUrl;
    this.clientId = portEnv.portClientId;
    this.clientSecret = portEnv.portClientSecret;
    this.logger = getLogger().child({ module: "port-client" });
  }

  /**
   * Get singleton instance of PortClient
   */
  static async getInstance(): Promise<PortClient> {
    if (!PortClient.instance) {
      PortClient.instance = new PortClient();
      await PortClient.instance.initializeToken();
    }
    return PortClient.instance;
  }

  /**
   * Initialize the access token.
   * Checks for a bearer token in environment first, otherwise generates an OAuth token.
   */
  private async initializeToken(): Promise<void> {
    // Check if we have a bearer token in environment
    const bearerToken = process.env.PORT_BEARER_TOKEN;
    if (bearerToken) {
      this.accessToken = bearerToken;
      // Set a default expiry time for bearer tokens
      this.tokenExpiryTime = Date.now() + BEARER_TOKEN_DEFAULT_EXPIRY_MS;
      this.logger.info("Using bearer token from environment");
    } else {
      await this.generateNewToken();
    }
  }

  /**
   * Generate a new OAuth token from Port API.
   * @throws Error if token generation fails
   */
  private async generateNewToken(): Promise<void> {
    try {
      this.logger.info("Generating new OAuth token");
      const response = await axios.post<OAuthResponse>(
        `${this.baseUrl}/auth/access_token`,
        {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
        },
      );

      this.accessToken = response.data.accessToken;
      // Calculate expiry time based on expiresIn (seconds)
      this.tokenExpiryTime = Date.now() + response.data.expiresIn * 1000;

      this.logger.info(
        { expiresInSeconds: response.data.expiresIn },
        "Token generated successfully",
      );
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          { error: error.response?.data || error.message },
          "OAuth token generation failed",
        );
      } else {
        this.logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Unexpected error during token generation",
        );
      }
      throw new Error("Failed to generate OAuth token");
    }
  }

  /**
   * Check if the current token is valid and regenerate if needed.
   * Uses a buffer time before actual expiry to prevent stale token usage.
   */
  private async ensureValidToken(): Promise<void> {
    const now = Date.now();

    // If no token or token is expired (with buffer), generate new one
    if (
      !this.accessToken ||
      !this.tokenExpiryTime ||
      this.tokenExpiryTime - now < TOKEN_EXPIRY_BUFFER_MS
    ) {
      await this.generateNewToken();
    }
  }

  /**
   * Make an authenticated request with automatic token refresh
   */
  private async makeAuthenticatedRequest<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    endpoint: string,
    data?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<T> {
    await this.ensureValidToken();

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) =>
        url.searchParams.set(key, value),
      );
    }

    const config: {
      method: string;
      url: string;
      headers: Record<string, string>;
      data?: Record<string, unknown>;
    } = {
      method,
      url: url.toString(),
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token might be invalid, try regenerating and retry once
        this.logger.warn("Token appears invalid, regenerating");
        await this.generateNewToken();

        // Retry the request with new token
        config.headers.Authorization = `Bearer ${this.accessToken}`;
        const retryResponse = await axios(config);
        return retryResponse.data;
      }
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    return this.makeAuthenticatedRequest<T>("GET", endpoint, undefined, params);
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    endpoint: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    return this.makeAuthenticatedRequest<T>("POST", endpoint, data);
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(
    endpoint: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    return this.makeAuthenticatedRequest<T>("PATCH", endpoint, data);
  }

  /**
   * DELETE request
   */
  async delete(endpoint: string): Promise<void> {
    return this.makeAuthenticatedRequest<void>("DELETE", endpoint);
  }

  // Entity Management Methods

  /**
   * Delete all entities of a specific type
   */
  async deleteAllEntities(entityType: string): Promise<void> {
    return this.delete(`/blueprints/${entityType}/all-entities`);
  }

  /**
   * Delete all entities of a specific type (static method)
   */
  static async deleteAllEntities(entityType: string): Promise<void> {
    const client = await PortClient.getInstance();
    return client.deleteAllEntities(entityType);
  }

  /**
   * Get all entities of a specific type
   */
  async getEntities(entityType: string): Promise<PortEntitiesResponse> {
    return this.get<PortEntitiesResponse>(`/blueprints/${entityType}/entities`);
  }

  /**
   * Get all entities of a specific type (static method)
   */
  static async getEntities(entityType: string): Promise<PortEntitiesResponse> {
    const client = await PortClient.getInstance();
    return client.getEntities(entityType);
  }

  /**
   * Get a specific entity by identifier
   */
  async getEntity(
    entityType: string,
    identifier: string,
  ): Promise<PortEntityResponse> {
    return this.get<PortEntityResponse>(
      `/blueprints/${entityType}/entities/${identifier}`,
    );
  }

  /**
   * Get a specific entity by identifier (static method)
   */
  static async getEntity(
    entityType: string,
    identifier: string,
  ): Promise<PortEntityResponse> {
    const client = await PortClient.getInstance();
    return client.getEntity(entityType, identifier);
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<PortEntitiesResponse> {
    return this.get<PortEntitiesResponse>("/blueprints/_user/entities");
  }

  /**
   * Get all users (static method)
   */
  static async getUsers(): Promise<PortEntitiesResponse> {
    const client = await PortClient.getInstance();
    return client.getUsers();
  }

  /**
   * Get a specific user by identifier
   */
  async getUser(identifier: string): Promise<PortEntityResponse> {
    return this.get<PortEntityResponse>(
      `/blueprints/_user/entities/${identifier}`,
    );
  }

  /**
   * Get a specific user by identifier (static method)
   */
  static async getUser(identifier: string): Promise<PortEntityResponse> {
    const client = await PortClient.getInstance();
    return client.getUser(identifier);
  }

  /**
   * Upsert multiple entities in bulk.
   * Maximum entities per request is defined by PORT_BATCH_SIZE constant.
   * Uses bulk endpoint which handles both creation and updates.
   *
   * @param blueprint - The blueprint identifier
   * @param entities - Array of entities to upsert (max PORT_BATCH_SIZE)
   * @throws Error if entities array exceeds PORT_BATCH_SIZE
   */
  async upsertEntities(
    blueprint: string,
    entities: PortEntity[],
  ): Promise<PortBulkEntitiesResponse> {
    if (entities.length > PORT_BATCH_SIZE) {
      throw new Error(
        `Cannot upsert more than ${PORT_BATCH_SIZE} entities in a single bulk request`,
      );
    }

    const payload: PortBulkEntitiesRequest = { entities };
    return this.post<PortBulkEntitiesResponse>(
      `/blueprints/${blueprint}/entities/bulk?upsert=true&merge=true`,
      payload as unknown as Record<string, unknown>,
    );
  }

  /**
   * Upsert multiple entities in bulk (static method)
   */
  static async upsertEntities(
    blueprint: string,
    entities: PortEntity[],
  ): Promise<PortBulkEntitiesResponse> {
    const client = await PortClient.getInstance();
    return client.upsertEntities(blueprint, entities);
  }

  /**
   * Get token information
   */
  getTokenInfo(): {
    hasToken: boolean;
    expiresAt: Date | null;
    isExpired: boolean;
  } {
    return {
      hasToken: !!this.accessToken,
      expiresAt: this.tokenExpiryTime ? new Date(this.tokenExpiryTime) : null,
      isExpired: this.tokenExpiryTime
        ? Date.now() > this.tokenExpiryTime
        : true,
    };
  }

  // Static methods for backward compatibility and convenience

  /**
   * Get singleton instance of PortClient (alias for getInstance)
   */
  static async getClient(): Promise<PortClient> {
    return PortClient.getInstance();
  }
}

// Legacy function exports for backward compatibility
// These now use the static methods of PortClient

export async function getClient(): Promise<PortClient> {
  return PortClient.getClient();
}

export async function deleteAllEntities(entityType: string): Promise<void> {
  return PortClient.deleteAllEntities(entityType);
}

export async function getEntities(
  entityType: string,
): Promise<PortEntitiesResponse> {
  return PortClient.getEntities(entityType);
}

export async function getEntity(
  entityType: string,
  identifier: string,
): Promise<PortEntityResponse> {
  return PortClient.getEntity(entityType, identifier);
}

export async function getUsers(): Promise<PortEntitiesResponse> {
  return PortClient.getUsers();
}

export async function getUser(identifier: string): Promise<PortEntityResponse> {
  return PortClient.getUser(identifier);
}

/**
 * Upsert multiple entities in bulk
 */
export async function upsertEntities(
  blueprint: string,
  entities: PortEntity[],
): Promise<PortBulkEntitiesResponse> {
  return PortClient.upsertEntities(blueprint, entities);
}

/**
 * Upsert multiple entities in batches using bulk ingestion.
 * Automatically handles batching into chunks of PORT_BATCH_SIZE entities.
 *
 * @param blueprint - The blueprint identifier
 * @param entities - Array of entities to upsert
 * @returns Array of bulk response objects, one per batch
 */
export async function upsertEntitiesInBatches(
  blueprint: string,
  entities: PortEntity[],
): Promise<PortBulkEntitiesResponse[]> {
  const logger = getLogger().child({ module: "port-client", operation: "upsertEntitiesInBatches" });
  const results: PortBulkEntitiesResponse[] = [];
  const totalBatches = Math.ceil(entities.length / PORT_BATCH_SIZE);

  for (let i = 0; i < entities.length; i += PORT_BATCH_SIZE) {
    const batch = entities.slice(i, i + PORT_BATCH_SIZE);
    const batchNumber = Math.floor(i / PORT_BATCH_SIZE) + 1;

    logger.info(
      { batchNumber, totalBatches, batchSize: batch.length },
      `Processing batch ${batchNumber}/${totalBatches}`,
    );

    try {
      const result = await upsertEntities(blueprint, batch);
      results.push(result);

      // Log results - check both entities array and errors array
      const successful = result.entities.filter((r) => r.created).length;
      const failedFromEntities = result.entities.filter(
        (r) => !r.created,
      ).length;
      const failedFromErrors = result.errors ? result.errors.length : 0;
      const totalFailed = failedFromEntities + failedFromErrors;

      logger.info(
        { batchNumber, successful, failed: totalFailed },
        "Batch completed",
      );

      if (totalFailed > 0) {
        // Collect failed identifiers from both sources
        const failedFromEntitiesIdentifiers = result.entities
          .filter((r) => !r.created)
          .map((r) => r.identifier);
        const failedFromErrorsIdentifiers = result.errors
          ? result.errors.map((e) => e.identifier)
          : [];
        const allFailedIdentifiers = [
          ...failedFromEntitiesIdentifiers,
          ...failedFromErrorsIdentifiers,
        ];

        logger.warn(
          { failedIdentifiers: allFailedIdentifiers },
          "Some entities failed in batch",
        );

        // Log error details if available
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((error) => {
            logger.warn(
              { identifier: error.identifier, message: error.message, statusCode: error.statusCode },
              "Entity upsert error",
            );
          });
        }
      }
    } catch (error) {
      logger.error(
        { batchNumber, error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to process batch",
      );
      throw error;
    }
  }

  return results;
}
