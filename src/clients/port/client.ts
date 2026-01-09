import process from 'node:process';
import axios from 'axios';
import type {
  OAuthResponse,
  PortEntitiesResponse,
  PortEntity,
  PortEntityResponse,
  PortBulkEntitiesRequest,
  PortBulkEntitiesResponse,
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
    this.baseUrl = 'https://api.getport.io/v1';
    this.clientId = process.env.PORT_CLIENT_ID || '';
    this.clientSecret = process.env.PORT_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('PORT_CLIENT_ID and PORT_CLIENT_SECRET must be set in environment variables');
    }
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
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
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
   * Upsert entity properties
   */
  async upsertProps(
    entity: string,
    identifier: string,
    properties: Record<string, unknown>
  ): Promise<unknown> {
    return this.patch(`/blueprints/${entity}/entities/${identifier}`, {
      properties,
    });
  }

  /**
   * Upsert entity properties (static method)
   */
  static async upsertProps(
    entity: string,
    identifier: string,
    properties: Record<string, unknown>
  ): Promise<unknown> {
    const client = await PortClient.getInstance();
    return client.upsertProps(entity, identifier, properties);
  }

  /**
   * Upsert a complete entity
   */
  async upsertEntity(
    entity: string,
    identifier: string,
    title: string,
    properties: Record<string, unknown>,
    relations: Record<string, unknown>,
    team: string[] | null = null
  ): Promise<unknown> {
    return this.patch(`/blueprints/${entity}/entities/${identifier}`, {
      title,
      properties,
      relations,
      team,
    });
  }

  /**
   * Upsert a complete entity (static method)
   */
  static async upsertEntity(
    entity: string,
    identifier: string,
    title: string,
    properties: Record<string, unknown>,
    relations: Record<string, unknown>,
    team: string[] | null = null
  ): Promise<unknown> {
    const client = await PortClient.getInstance();
    return client.upsertEntity(entity, identifier, title, properties, relations, team);
  }

  /**
   * Create a new entity
   */
  async createEntity(blueprint: string, entity: PortEntity): Promise<unknown> {
    return this.post(`/blueprints/${blueprint}/entities`, entity);
  }

  /**
   * Create a new entity (static method)
   */
  static async createEntity(blueprint: string, entity: PortEntity): Promise<unknown> {
    const client = await PortClient.getInstance();
    return client.createEntity(blueprint, entity);
  }

  /**
   * Create multiple entities in bulk with upsert support
   * Maximum 20 entities per request as per Port API limits
   */
  async createBulkEntities(
    blueprint: string,
    entities: PortEntity[]
  ): Promise<PortBulkEntitiesResponse> {
    if (entities.length > 20) {
      throw new Error('Cannot create more than 20 entities in a single bulk request');
    }

    const payload: PortBulkEntitiesRequest = { entities };
    return this.post<PortBulkEntitiesResponse>(
      `/blueprints/${blueprint}/entities/bulk?upsert=true&merge=true`,
      payload as unknown as Record<string, unknown>
    );
  }

  /**
   * Create multiple entities in bulk with upsert support (static method)
   */
  static async createBulkEntities(
    blueprint: string,
    entities: PortEntity[]
  ): Promise<PortBulkEntitiesResponse> {
    const client = await PortClient.getInstance();
    return client.createBulkEntities(blueprint, entities);
  }

  /**
   * Update an existing entity
   */
  async updateEntity(blueprint: string, entity: PortEntity): Promise<PortEntity> {
    return this.patch<PortEntity>(`/blueprints/${blueprint}/entities/${entity.identifier}`, entity);
  }

  /**
   * Update an existing entity (static method)
   */
  static async updateEntity(blueprint: string, entity: PortEntity): Promise<PortEntity> {
    const client = await PortClient.getInstance();
    return client.updateEntity(blueprint, entity);
  }

  /**
   * Get token information
   */
  getTokenInfo(): { hasToken: boolean; expiresAt: Date | null; isExpired: boolean } {
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

export async function upsertProps(
  entity: string,
  identifier: string,
  properties: Record<string, unknown>
): Promise<unknown> {
  return PortClient.upsertProps(entity, identifier, properties);
}

export async function upsertEntity(
  entity: string,
  identifier: string,
  title: string,
  properties: Record<string, unknown>,
  relations: Record<string, unknown>,
  team: string[] | null = null
): Promise<unknown> {
  return PortClient.upsertEntity(entity, identifier, title, properties, relations, team);
}

export async function createEntity(blueprint: string, entity: PortEntity): Promise<unknown> {
  return PortClient.createEntity(blueprint, entity);
}

export async function createBulkEntities(
  blueprint: string,
  entities: PortEntity[]
): Promise<PortBulkEntitiesResponse> {
  return PortClient.createBulkEntities(blueprint, entities);
}

/**
 * Create multiple entities in batches using bulk ingestion
 * Automatically handles batching into chunks of 20 entities
 */
export async function createEntitiesInBatches(
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
      const result = await createBulkEntities(blueprint, batch);
      results.push(result);

      // Log results - check both entities array and errors array
      const successful = result.entities.filter((r) => r.created).length;
      const failedFromEntities = result.entities.filter((r) => !r.created).length;
      const failedFromErrors = result.errors ? result.errors.length : 0;
      const totalFailed = failedFromEntities + failedFromErrors;
      
      console.log(`Batch completed: ${successful} successful, ${totalFailed} failed`);

      if (totalFailed > 0) {
        // Collect failed identifiers from both sources
        const failedFromEntitiesIdentifiers = result.entities
          .filter((r) => !r.created)
          .map((r) => r.identifier);
        const failedFromErrorsIdentifiers = result.errors 
          ? result.errors.map((e) => e.identifier)
          : [];
        const allFailedIdentifiers = [...failedFromEntitiesIdentifiers, ...failedFromErrorsIdentifiers];
        
        console.warn(`Failed entities in batch: ${allFailedIdentifiers.join(', ')}`);
        
        // Log error details if available
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

export async function updateEntity(blueprint: string, entity: PortEntity): Promise<PortEntity> {
  return PortClient.updateEntity(blueprint, entity);
}
