import axios from "axios";
import type { ITemplate, IWorkspacesResponse } from "./types";
import { getCoderEnv } from "../../env";

class ApiClient {
  private baseUrl: string;
  private sessionToken: string;
  organizationId: string;
  private static instance: ApiClient;

  static async getClient() {
    const { sessionToken, apiBaseUrl, organizationId } = getCoderEnv();
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(
        apiBaseUrl,
        sessionToken,
        organizationId,
      );
    }
    return ApiClient.instance;
  }

  constructor(baseUrl: string, sessionToken: string, organizationId: string) {
    this.baseUrl = baseUrl;
    this.sessionToken = sessionToken;
    this.organizationId = organizationId;
  }

  async get<T = unknown>(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    const response = await axios.get<T>(url.toString(), {
      headers: {
        "Coder-Session-Token": this.sessionToken,
        Accept: "application/json",
      },
    });

    return response.data;
  }

  async post<T = unknown>(
    endpoint: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    const response = await axios.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: {
        "Coder-Session-Token": this.sessionToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    return response.data;
  }

  async delete(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    await axios.delete(url, {
      headers: {
        "Coder-Session-Token": this.sessionToken,
      },
    });
  }
}

export async function getClient() {
  return ApiClient.getClient();
}

export async function getWorkspaces(): Promise<IWorkspacesResponse> {
  const client = await ApiClient.getClient();
  return client.get<IWorkspacesResponse>("/workspaces");
}

export async function getTemplates(): Promise<ITemplate[]> {
  const client = await ApiClient.getClient();
  return client.get<ITemplate[]>("/templates");
}

export async function createWorkspace(
  templateId: string,
  name: string,
  _ttl: number,
) {
  const client = await ApiClient.getClient();
  // Using the port API token's user
  return client.post(
    `/organizations/${client.organizationId}/members/me/workspaces`,
    {
      name,
      template_id: templateId,
      ttl_ms: 0,
    },
  );
}
