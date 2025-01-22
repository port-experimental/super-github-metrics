import axios from 'axios';
import process from "node:process";
import _ from 'lodash';

interface OAuthResponse {
    accessToken: string;
}

async function generateOAuthToken(): Promise<string> {
    const clientId = process.env.PORT_CLIENT_ID;
    const clientSecret = process.env.PORT_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        throw new Error('CLIENT_ID and CLIENT_SECRET must be set in the environment variables');
    }
    
    try {
        const response = await axios.post<OAuthResponse>(
            "https://api.getport.io/v1/auth/access_token", {
                clientId,
                clientSecret,
            });
        
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
        let bearerToken: string = process.env.PORT_BEARER_TOKEN || await generateOAuthToken();
        if (!this.instance) {
            this.instance = new ApiClient('https://api.getport.io/v1', bearerToken);
        }
        return this.instance;
    }
    
    constructor(baseUrl: string, bearerToken: string) {
        this.baseUrl = baseUrl;
        this.bearerToken = bearerToken;
    }
    
    async get(endpoint: string, params: Record<string, string> = {}): Promise<any> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        
        const response = await axios.get(url.toString(), {
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
            },
        });
        
        return response.data;
    }
    
    async post(endpoint: string, data: any): Promise<any> {
        const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
                'Content-Type': 'application/json',
            },
        });
        return response;
    }

    async delete(endpoint: string): Promise<any> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await axios.delete(url, {
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
                // 'Content-Type': null,
            },
        })
        return response;
    }
}

export async function getClient() {
    return ApiClient.getClient();
}

export async function deleteAllEntities(entityType) {
    const client = await ApiClient.getClient();
    return client.delete(`/blueprints/${entityType}/all-entities`);
    
}
export async function getEntities(entityType) {
    const client = await ApiClient.getClient();
    return client.get(`/blueprints/${entityType}/entities`);
}

export async function getEntity(entityType, identifier) {
    const client = await ApiClient.getClient();
    return client.get(`/blueprints/${entityType}/entities/${identifier}`);
}

export async function upsertEntity(entity, identifier, title, properties, relations) {
    const client = await ApiClient.getClient();
    return client.post(`/blueprints/${entity}/entities?upsert=true&merge=true`, {
        identifier,
        title,
        properties,
        relations,
    });
}
