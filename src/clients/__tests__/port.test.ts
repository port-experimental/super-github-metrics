import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PortClient } from '../port';

// Mock axios with proper typing
const mockAxios = {
  get: jest.fn<() => any>(),
  post: jest.fn<() => any>(),
  patch: jest.fn<() => any>(),
  delete: jest.fn<() => any>(),
  isAxiosError: jest.fn<() => any>(),
};

jest.mock('axios', () => ({
  __esModule: true,
  default: mockAxios,
  isAxiosError: mockAxios.isAxiosError,
}));

import axios from 'axios';

// Mock environment variables
const originalEnv = process.env;

describe('PortClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PORT_CLIENT_ID: 'test-client-id',
      PORT_CLIENT_SECRET: 'test-client-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should create a singleton instance', async () => {
      const instance1 = await PortClient.getInstance();
      const instance2 = await PortClient.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(PortClient);
    });

    it('should throw error if environment variables are missing', async () => {
      delete process.env.PORT_CLIENT_ID;
      delete process.env.PORT_CLIENT_SECRET;

      await expect(PortClient.getInstance()).rejects.toThrow(
        'PORT_CLIENT_ID and PORT_CLIENT_SECRET must be set in environment variables'
      );
    });
  });

  describe('token management', () => {
    it('should initialize token on first request', async () => {
      const mockOAuthResponse = {
        accessToken: 'test-token',
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      const tokenInfo = client.getTokenInfo();

      expect(tokenInfo.hasToken).toBe(true);
      expect(tokenInfo.isExpired).toBe(false);
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.getport.io/v1/auth/access_token',
        {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        }
      );
    });

    it('should regenerate token when expired', async () => {
      const mockOAuthResponse = {
        accessToken: 'new-token',
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      
      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;
      
      await (client as any).ensureValidToken();

      expect(axios.post).toHaveBeenCalledTimes(2); // Initial + regeneration
    });

    it('should retry request with new token on 401 error', async () => {
      const mockOAuthResponse = {
        accessToken: 'new-token',
        expiresIn: 3600,
      };

      mockAxios.post
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      
      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;
      
      await (client as any).ensureValidToken();

      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('API methods', () => {
    it('should make authenticated GET request', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.get('/test-endpoint');

      expect(result).toEqual(mockResponse.data);
      expect(axios.get).toHaveBeenCalledWith('/test-endpoint', {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });

    it('should make authenticated POST request', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.post('/test-endpoint', { test: 'data' });

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith('/test-endpoint', { test: 'data' }, {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });

    it('should make authenticated PATCH request', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.patch.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.patch('/test-endpoint', { test: 'data' });

      expect(result).toEqual(mockResponse.data);
      expect(axios.patch).toHaveBeenCalledWith('/test-endpoint', { test: 'data' }, {
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      });
    });

    it('should make authenticated DELETE request', async () => {
      mockAxios.delete.mockResolvedValueOnce({});

      const client = await PortClient.getInstance();
      await client.delete('/test-endpoint');

      expect(axios.delete).toHaveBeenCalledWith('/test-endpoint', {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });
  });

  describe('entity operations', () => {
    it('should get entities for a blueprint', async () => {
      const mockResponse = { data: { entities: [] } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.getEntities('testBlueprint');

      expect(result).toEqual({ entities: [] });
      expect(axios.get).toHaveBeenCalledWith('/blueprints/testBlueprint/entities', {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });

    it('should get entity by identifier', async () => {
      const mockResponse = { data: { entity: {} } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.getEntity('testBlueprint', 'test-entity');

      expect(result).toEqual({ entity: {} });
      expect(axios.get).toHaveBeenCalledWith('/blueprints/testBlueprint/entities/test-entity', {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });

    it('should create entity', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.createEntity('testBlueprint', { identifier: 'test', title: 'Test' });

      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledWith('/blueprints/testBlueprint/entities', { identifier: 'test', title: 'Test' }, {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });

    it('should update entity', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.patch.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.updateEntity('testBlueprint', { identifier: 'test', title: 'Updated' });

      expect(result).toEqual({ success: true });
      expect(axios.patch).toHaveBeenCalledWith('/blueprints/testBlueprint/entities', { identifier: 'test', title: 'Updated' }, {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });
  });

  describe('property operations', () => {
    it('should upsert entity properties', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.patch.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.upsertProps('testBlueprint', 'test-entity', { property: 'value' });

      expect(result).toEqual({ success: true });
      expect(axios.patch).toHaveBeenCalledWith('/blueprints/testBlueprint/entities/test-entity', { properties: { property: 'value' } }, {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      });
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const client = await PortClient.getInstance();
      
      await expect(client.get('/test-endpoint')).rejects.toThrow('Network error');
    });

    it('should handle token refresh on 401', async () => {
      const mockOAuthResponse = {
        accessToken: 'new-token',
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get.mockResolvedValueOnce({ data: { success: true } });

      const client = await PortClient.getInstance();
      
      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;
      
      const result = await client.get('/test-endpoint');

      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledTimes(2); // Initial + refresh
    });
  });
}); 