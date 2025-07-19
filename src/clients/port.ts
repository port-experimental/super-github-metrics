import process from 'node:process';
import axios from 'axios';
import type {
  OAuthResponse,
  PortEntitiesResponse,
  PortEntity,
  PortEntityResponse,
  PortUpsertPayload,
} from '../types/port';

async function generateOAuthToken(): Promise<string> {
  const clientId = process.env.PORT_CLIENT_ID;
  const clientSecret = process.env.PORT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('CLIENT_ID and CLIENT_SECRET must be set in the environment variables');
  }

  try {
    const response = await axios.post<OAuthResponse>(
      'https://api.getport.io/v1/auth/access_token',
      {
        clientId,
        clientSecret,
      }
    );

    return response.data.accessToken;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('OAuth token generation failed:', error.response?.data || error.message);
    } else {
      console.error('An unexpected error occurred:', error);
    }
    throw error;
  }
}

class ApiClient {
  private baseUrl: string;
  private bearerToken: string;
  private static instance: ApiClient;

  static async getClient() {
    const bearerToken: string = process.env.PORT_BEARER_TOKEN || (await generateOAuthToken());
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient('https://api.getport.io/v1', bearerToken);
    }
    return ApiClient.instance;
  }

  constructor(baseUrl: string, bearerToken: string) {
    this.baseUrl = baseUrl;
    this.bearerToken = bearerToken;
  }

  async get<T = unknown>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const response = await axios.get<T>(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });

    return response.data;
  }

  async post<T = unknown>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const response = await axios.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  }

  async delete(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });
  }

  async patch<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const response = await axios.patch<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });
    return response.data;
  }
}

export async function getClient() {
  return ApiClient.getClient();
}

export async function deleteAllEntities(entityType: string) {
  const client = await ApiClient.getClient();
  return client.delete(`/blueprints/${entityType}/all-entities`);
}

export async function getEntities(entityType: string): Promise<PortEntitiesResponse> {
  const client = await ApiClient.getClient();
  return client.get<PortEntitiesResponse>(`/blueprints/${entityType}/entities`);
}

export async function getEntity(
  entityType: string,
  identifier: string
): Promise<PortEntityResponse> {
  const client = await ApiClient.getClient();
  return client.get<PortEntityResponse>(`/blueprints/${entityType}/entities/${identifier}`);
}

export async function getUsers(): Promise<PortEntitiesResponse> {
  const client = await ApiClient.getClient();
  return client.get<PortEntitiesResponse>('/blueprints/_user/entities');
}

export async function getUser(identifier: string): Promise<PortEntityResponse> {
  const client = await ApiClient.getClient();
  return client.get<PortEntityResponse>(`/blueprints/_user/entities/${identifier}`);
}

export async function upsertProps(
  entity: string,
  identifier: string,
  properties: Record<string, unknown>
) {
  const client = await ApiClient.getClient();
  return client.post(`/blueprints/${entity}/entities?upsert=true&merge=true`, {
    identifier,
    properties,
  });
}

export async function upsertEntity(
  entity: string,
  identifier: string,
  title: string,
  properties: Record<string, unknown>,
  relations: Record<string, unknown>,
  team: string[] | null = null
) {
  const client = await ApiClient.getClient();
  const payload: PortUpsertPayload = {
    identifier,
    title,
    properties,
    relations,
  };
  if (team) {
    payload.team = team;
  }
  return client.post(`/blueprints/${entity}/entities?upsert=true&merge=true`, payload);
}

export async function createEntity(blueprint: string, entity: PortEntity) {
  const client = await ApiClient.getClient();
  return client.post(`/blueprints/${blueprint}/entities`, entity);
}

export async function updateEntity(blueprint: string, entity: PortEntity) {
  const client = await ApiClient.getClient();
  return client.patch<PortEntity>(`/blueprints/${blueprint}/entities/${entity.identifier}`, entity);
}
