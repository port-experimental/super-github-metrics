import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock axios before imports
jest.mock('axios', () => {
  const mockAxiosInstance: any = jest.fn<() => any>();
  mockAxiosInstance.get = jest.fn<() => any>();
  mockAxiosInstance.post = jest.fn<() => any>();
  mockAxiosInstance.patch = jest.fn<() => any>();
  mockAxiosInstance.delete = jest.fn<() => any>();
  mockAxiosInstance.isAxiosError = jest.fn<() => any>();

  return {
    __esModule: true,
    default: mockAxiosInstance,
    isAxiosError: mockAxiosInstance.isAxiosError,
  };
});

import axios from 'axios';
import { PortClient } from '../port';

// Get reference to the mocked axios
const mockAxios: any = axios;

// Mock environment variables
const originalEnv = process.env;

const BASE_URL = 'https://test.api.getport.io/v1';

describe('Port Client Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton between tests
    (PortClient as any).instance = null;

    process.env = {
      ...originalEnv,
      PORT_CLIENT_ID: 'test-client-id',
      PORT_CLIENT_SECRET: 'test-client-secret',
      PORT_BASE_URL: BASE_URL,
    };

    // Default OAuth token mock
    mockAxios.post.mockResolvedValue({ data: { accessToken: 'test-token', expiresIn: 3600 } });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('OAuth Token Management', () => {
    it('should handle OAuth token generation with expiresIn', async () => {
      const mockOAuthResponse = {
        accessToken: 'test-token-123',
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      const tokenInfo = client.getTokenInfo();

      expect(tokenInfo.hasToken).toBe(true);
      expect(tokenInfo.isExpired).toBe(false);
      expect(tokenInfo.expiresAt).toBeInstanceOf(Date);

      // Check that expiry time is set correctly (within 5 seconds tolerance)
      const expectedExpiry = Date.now() + 3600 * 1000;
      const actualExpiry = tokenInfo.expiresAt?.getTime();
      expect(actualExpiry).toBeGreaterThan(expectedExpiry - 5000);
      expect(actualExpiry).toBeLessThan(expectedExpiry + 5000);
    });

    it('should handle bearer token from environment', async () => {
      process.env.PORT_BEARER_TOKEN = 'bearer-token-123';

      const client = await PortClient.getInstance();
      const tokenInfo = client.getTokenInfo();

      expect(tokenInfo.hasToken).toBe(true);
      expect(tokenInfo.isExpired).toBe(false);
      // Bearer token path skips OAuth
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should regenerate token when expired', async () => {
      // First token
      mockAxios.post
        .mockResolvedValueOnce({ data: { accessToken: 'old-token', expiresIn: 3600 } })
        .mockResolvedValueOnce({ data: { accessToken: 'new-token', expiresIn: 7200 } });

      const client = await PortClient.getInstance();

      // Expire the token
      (client as any).tokenExpiryTime = Date.now() - 1000;

      await (client as any).ensureValidToken();

      expect(axios.post).toHaveBeenCalledTimes(2);
      expect(axios.post).toHaveBeenLastCalledWith(`${BASE_URL}/auth/access_token`, {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
    });

    it('should handle OAuth token generation errors', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('OAuth failed'));

      await expect(PortClient.getInstance()).rejects.toThrow('Failed to generate OAuth token');
    });

    it('should handle axios errors in OAuth', async () => {
      const axiosError = {
        response: {
          data: { error: 'invalid_client' },
          status: 401,
        },
        isAxiosError: true,
      };

      mockAxios.post.mockRejectedValueOnce(axiosError);
      mockAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(PortClient.getInstance()).rejects.toThrow('Failed to generate OAuth token');
    });
  });

  describe('API Request Handling', () => {
    it('should make authenticated GET requests', async () => {
      const mockData = { success: true, entities: [] };
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.get('/entities');

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: `${BASE_URL}/entities`,
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should make authenticated POST requests', async () => {
      const mockData = { success: true };
      const postData = { name: 'test-entity' };
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.post('/entities', postData);

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: `${BASE_URL}/entities`,
          data: postData,
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should retry requests with new token on 401 errors', async () => {
      // Default beforeEach mock handles initial OAuth (post call #1)
      const client = await PortClient.getInstance();

      const error401: any = new Error('Unauthorized');
      error401.isAxiosError = true;
      error401.response = { status: 401 };
      mockAxios.isAxiosError.mockReturnValue(true);

      // First axios(config) → 401, refresh token (post call #2), retry → success
      mockAxios.mockRejectedValueOnce(error401).mockResolvedValueOnce({ data: { success: true } });

      const result = await client.get('/entities');

      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledTimes(2); // Initial + refresh after 401
    });

    it('should handle non-401 errors without retry', async () => {
      const error500 = { response: { status: 500 } };
      mockAxios.mockRejectedValueOnce(error500);

      const client = await PortClient.getInstance();

      await expect(client.get('/entities')).rejects.toEqual(error500);
      expect(mockAxios).toHaveBeenCalledTimes(1); // axios(config) called once (no retry)
    });
  });

  describe('Entity Operations', () => {
    it('should delete all entities of a type', async () => {
      mockAxios.mockResolvedValueOnce({ data: undefined });

      const client = await PortClient.getInstance();
      await client.deleteAllEntities('github_user');

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: `${BASE_URL}/blueprints/github_user/all-entities`,
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('Static Methods', () => {
    it('should provide static access to entity upsert operations', async () => {
      const mockApiResponse = {
        entities: [{ identifier: 'test-user', created: true, index: 0, additionalData: {} }],
        ok: true,
        errors: [],
      };

      mockAxios.mockResolvedValueOnce({ data: mockApiResponse });

      const result = await PortClient.upsertEntities('github_user', [
        { identifier: 'test-user', title: 'Test User', properties: { name: 'test' } },
      ]);

      expect(result).toEqual(mockApiResponse);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: `${BASE_URL}/blueprints/github_user/entities/bulk?upsert=true&merge=true`,
          data: {
            entities: [
              { identifier: 'test-user', title: 'Test User', properties: { name: 'test' } },
            ],
          },
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle concurrent static method calls with a single token', async () => {
      const mockApiResponse = {
        entities: [{ identifier: 'user1', created: true, index: 0, additionalData: {} }],
        ok: true,
        errors: [],
      };

      // All three bulk requests resolve with the same mock
      mockAxios
        .mockResolvedValueOnce({ data: mockApiResponse })
        .mockResolvedValueOnce({ data: mockApiResponse })
        .mockResolvedValueOnce({ data: mockApiResponse });

      await Promise.all([
        PortClient.upsertEntities('github_user', [
          { identifier: 'user1', title: 'User 1', properties: { name: 'test1' } },
        ]),
        PortClient.upsertEntities('github_user', [
          { identifier: 'user2', title: 'User 2', properties: { name: 'test2' } },
        ]),
        PortClient.upsertEntities('github_user', [
          { identifier: 'user3', title: 'User 3', properties: { name: 'test3' } },
        ]),
      ]);

      // Only one OAuth token should have been generated (singleton)
      expect(axios.post).toHaveBeenCalledTimes(1);
      // Three bulk requests
      expect(mockAxios).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing environment variables', async () => {
      delete process.env.PORT_CLIENT_ID;
      delete process.env.PORT_CLIENT_SECRET;

      await expect(PortClient.getInstance()).rejects.toThrow('Invalid environment variables');
    });

    it('should handle network errors', async () => {
      mockAxios.mockRejectedValueOnce(new Error('Network error'));

      const client = await PortClient.getInstance();

      await expect(client.get('/entities')).rejects.toThrow('Network error');
    });

    it('should return undefined data for empty API responses', async () => {
      // axios(config) resolves with {} → response.data is undefined
      mockAxios.mockResolvedValueOnce({});

      const client = await PortClient.getInstance();
      const result = await client.get('/entities');

      expect(result).toBeUndefined();
    });
  });
});
