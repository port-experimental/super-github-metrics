import axios from 'axios';
import process from "node:process";
import _ from 'lodash';
import { Template, WorkspacesResponse } from './coder_types';


class ApiClient {
    private baseUrl: string;
    private sessionToken: string;
    organizationId: string;
    private static instance: ApiClient;
    
    static async getClient() {
        if (!process.env.CODER_SESSION_TOKEN || !process.env.CODER_API_BASE_URL || !process.env.CODER_ORGANIZATION_ID) {
            throw new Error('Need env vars CODER_SESSION_TOKEN and CODER_API_BASE_URL and CODER_ORGANIZATION_ID')
        }
        let sessionToken: string = process.env.CODER_SESSION_TOKEN;
        let apiBaseUrl: string = process.env.CODER_API_BASE_URL;
        let organizationId: string = process.env.CODER_ORGANIZATION_ID;
        if (!this.instance) {
            this.instance = new ApiClient(apiBaseUrl, sessionToken, organizationId);
        }
        return this.instance;
    }
    
    constructor(baseUrl: string, sessionToken: string, organizationId: string) {
        this.baseUrl = baseUrl;
        this.sessionToken = sessionToken;
        this.organizationId = organizationId;
    }
    
    async get(endpoint: string, params: Record<string, string> = {}): Promise<any> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        
        const response = await axios.get(url.toString(), {
            headers: {
                'Coder-Session-Token': this.sessionToken,
                'Accept': 'application/json'
            },
        });
        
        return response.data;
    }
    
    async post(endpoint: string, data: any): Promise<any> {
        const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
            headers: {
                'Coder-Session-Token': this.sessionToken,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
        return response;
    }

    async delete(endpoint: string): Promise<any> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await axios.delete(url, {
            headers: {
                'Coder-Session-Token': this.sessionToken,
                // 'Content-Type': null,
            },
        })
        return response;
    }
}

export async function getClient() {
    return ApiClient.getClient();
}

export async function getWorkspaces(): Promise<WorkspacesResponse> {
    const client = await ApiClient.getClient();
    return client.get('/workspaces');
}

export async function getTemplates(): Promise<Template[]> {
    const client = await ApiClient.getClient();
    return client.get('/templates');
}

export async function createWorkspace(templateId, name, ttl) {
    const client = await ApiClient.getClient();
    // Using the port API token's user
    return client.post(`/organizations/${client.organizationId}/members/me/workspaces`, {
        name,
        template_id: templateId,
        ttl_ms: 0
    });
}
