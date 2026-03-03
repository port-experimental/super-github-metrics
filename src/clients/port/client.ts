import axios from 'axios';
import { getPortEnv } from '../../env';
import type {
  OAuthResponse,
  PortBulkEntitiesRequest,
  PortBulkEntitiesResponse,
  PortEntitiesResponse,
  PortEntity,
  PortEntityResponse,
} from './types';

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

  private constructor() {
    const portEnv = getPortEnv();
    this.baseUrl = portEnv.portBaseUrl;
    this.clientId = portEnv.portClientId;
    this.clientSecret = portEnv.portClientSecret;
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
   * Initialize the access token
   */
  private async initializeToken(): Promise<void> {
    // Check if we have a bearer token in environment
    const bearerToken = process.env.PORT_BEARER_TOKEN;
    if (bearerToken) {
      this.accessToken = bearerToken;
      // Set a default expiry time for bearer tokens (24 hours)
      this.tokenExpiryTime = Date.now() + 24 * 60 * 60 * 1000;
    } else {
      await this.generateNewToken();
    }
  }

  /**
   * Generate a new OAuth token
   */
  private async generateNewToken(): Promise<void> {
    try {
      console.log('Generating new OAuth token...');
      console.log(
        `Port credentials check - clientId length: ${this.clientId.length}, clientSecret length: ${this.clientSecret.length}, baseUrl: ${this.baseUrl}`
      );
      const response = await axios.post<OAuthResponse>(`${this.baseUrl}/auth/access_token`, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });

      this.accessToken = response.data.accessToken;
      // Calculate expiry time based on expiresIn (seconds)
      this.tokenExpiryTime = Date.now() + response.data.expiresIn * 1000;

      console.log(`Token generated successfully. Expires in ${response.data.expiresIn} seconds`);
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('OAuth token generation failed:', error.response?.data || error.message);
      } else {
        console.error(
          'An unexpected error occurred during token generation:',
          error.message || 'Unknown error'
        );
      }
      throw new Error('Failed to generate OAuth token');
    }
  }

  /**
   * Check if the current token is valid and regenerate if needed
   */
  private async ensureValidToken(): Promise<void> {
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer before expiry

    // If no token or token is expired (with buffer), generate new one
    if (!this.accessToken || !this.tokenExpiryTime || this.tokenExpiryTime - now < bufferTime) {
      await this.generateNewToken();
    }
  }

  /**
   * Make an authenticated request with automatic token refresh
   */
  private async makeAuthenticatedRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: Record<string, unknown>,
    params?: Record<string, string>
  ): Promise<T> {
    await this.ensureValidToken();

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
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
        'Content-Type': 'application/json',
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
        console.log('Token appears invalid, regenerating...');
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
  async get<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
    return this.makeAuthenticatedRequest<T>('GET', endpoint, undefined, params);
  }

  /**
   * POST request
   */
  async post<T = unknown>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    return this.makeAuthenticatedRequest<T>('POST', endpoint, data);
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    return this.makeAuthenticatedRequest<T>('PATCH', endpoint, data);
  }

  /**
   * DELETE request
   */
  async delete(endpoint: string): Promise<void> {
    return this.makeAuthenticatedRequest<void>('DELETE', endpoint);
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
  async getEntity(entityType: string, identifier: string): Promise<PortEntityResponse> {
    return this.get<PortEntityResponse>(`/blueprints/${entityType}/entities/${identifier}`);
  }

  /**
   * Get a specific entity by identifier (static method)
   */
  static async getEntity(entityType: string, identifier: string): Promise<PortEntityResponse> {
    const client = await PortClient.getInstance();
    return client.getEntity(entityType, identifier);
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<PortEntitiesResponse> {
    return this.get<PortEntitiesResponse>('/blueprints/_user/entities');
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
    return this.get<PortEntityResponse>(`/blueprints/_user/entities/${identifier}`);
  }

  /**
   * Get a specific user by identifier (static method)
   */
  static async getUser(identifier: string): Promise<PortEntityResponse> {
    const client = await PortClient.getInstance();
    return client.getUser(identifier);
  }

  /**
   * Upsert multiple entities in bulk
   * Maximum 20 entities per request as per Port API limits
   * Uses bulk endpoint which handles both creation and updates
   */
  async upsertEntities(
    blueprint: string,
    entities: PortEntity[]
  ): Promise<PortBulkEntitiesResponse> {
    if (entities.length > 20) {
      throw new Error('Cannot upsert more than 20 entities in a single bulk request');
    }

    const payload: PortBulkEntitiesRequest = { entities };

    return this.post<PortBulkEntitiesResponse>(
      `/blueprints/${blueprint}/entities/bulk?upsert=true&merge=true`,
      payload as unknown as Record<string, unknown>
    );
  }

  /**
   * Upsert multiple entities in bulk (static method)
   */
  static async upsertEntities(
    blueprint: string,
    entities: PortEntity[]
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
      isExpired: this.tokenExpiryTime ? Date.now() > this.tokenExpiryTime : true,
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

export async function getEntities(entityType: string): Promise<PortEntitiesResponse> {
  return PortClient.getEntities(entityType);
}

export async function getEntity(
  entityType: string,
  identifier: string
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
  entities: PortEntity[]
): Promise<PortBulkEntitiesResponse> {
  return PortClient.upsertEntities(blueprint, entities);
}

/**
 * Upsert multiple entities in batches using bulk ingestion
 * Automatically handles batching into chunks of 20 entities
 */
export async function upsertEntitiesInBatches(
  blueprint: string,
  entities: PortEntity[]
): Promise<PortBulkEntitiesResponse[]> {
  const batchSize = 20;
  const results: PortBulkEntitiesResponse[] = [];

  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entities.length / batchSize)} (${batch.length} entities)`
    );

    try {
      const result = await upsertEntities(blueprint, batch);
      results.push(result);

      // Log results - only the errors array contains actual failures
      // When using upsert=true&merge=true, created:false means successfully updated (not a failure)
      const totalProcessed = result.entities.length;
      const totalFailed = result.errors ? result.errors.length : 0;
      const totalSuccessful = totalProcessed - totalFailed;

      console.log(`Batch completed: ${totalSuccessful} successful, ${totalFailed} failed`);

      if (totalFailed > 0) {
        // Only log actual errors from the errors array
        const failedIdentifiers = result.errors ? result.errors.map((e) => e.identifier) : [];
        console.warn(`Failed entities in batch: ${failedIdentifiers.join(', ')}`);

        // Log error details
        if (result.errors && result.errors.length > 0) {
          console.warn('Error details:');
          result.errors.forEach((error) => {
            console.warn(`  - ${error.identifier}: ${error.message} (${error.statusCode})`);
          });
        }
      }
    } catch (error) {
      console.error(
        `Failed to process batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  return results;
}
