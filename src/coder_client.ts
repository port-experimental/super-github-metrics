import process from 'node:process';
import axios from 'axios';
import type { Template, WorkspacesResponse } from './coder_types';

class ApiClient {
  private baseUrl: string;
  private sessionToken: string;
  organizationId: string;
  private static instance: ApiClient;

  static async getClient() {
    if (
      !process.env.CODER_SESSION_TOKEN ||
      !process.env.CODER_API_BASE_URL ||
      !process.env.CODER_ORGANIZATION_ID
    ) {
      throw new Error(
        'Need env vars CODER_SESSION_TOKEN and CODER_API_BASE_URL and CODER_ORGANIZATION_ID'
      );
    }
    const sessionToken: string = process.env.CODER_SESSION_TOKEN;
    const apiBaseUrl: string = process.env.CODER_API_BASE_URL;
    const organizationId: string = process.env.CODER_ORGANIZATION_ID;
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(apiBaseUrl, sessionToken, organizationId);
    }
    return ApiClient.instance;
  }

  constructor(baseUrl: string, sessionToken: string, organizationId: string) {
    this.baseUrl = baseUrl;
    this.sessionToken = sessionToken;
    this.organizationId = organizationId;
  }

  async get<T = unknown>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const response = await axios.get<T>(url.toString(), {
      headers: {
        'Coder-Session-Token': this.sessionToken,
        Accept: 'application/json',
      },
    });

    return response.data;
  }

  async post<T = unknown>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const response = await axios.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: {
        'Coder-Session-Token': this.sessionToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  }

  async delete(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    await axios.delete(url, {
      headers: {
        'Coder-Session-Token': this.sessionToken,
      },
    });
  }
}

export async function getClient() {
  return ApiClient.getClient();
}

export async function getWorkspaces(): Promise<WorkspacesResponse> {
  const client = await ApiClient.getClient();
  return client.get<WorkspacesResponse>('/workspaces');
}

export async function getTemplates(): Promise<Template[]> {
  const client = await ApiClient.getClient();
  return client.get<Template[]>('/templates');
}

export async function createWorkspace(templateId: string, name: string, _ttl: number) {
  const client = await ApiClient.getClient();
  // Using the port API token's user
  return client.post(`/organizations/${client.organizationId}/members/me/workspaces`, {
    name,
    template_id: templateId,
    ttl_ms: 0,
  });
}
