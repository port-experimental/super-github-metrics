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
import { PortClient, upsertEntitiesInBatches } from '../port';

// Get reference to the mocked axios
const mockAxios: any = axios;

// Mock environment variables
const originalEnv = process.env;

describe('PortClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton so each test starts with a fresh instance
    (PortClient as any).instance = null;

    process.env = {
      ...originalEnv,
      PORT_CLIENT_ID: 'test-client-id',
      PORT_CLIENT_SECRET: 'test-client-secret',
      // Include /v1 in base URL so token and entity URLs match test assertions
      PORT_BASE_URL: 'https://test.api.getport.io/v1',
    };

    // Default mock for OAuth token generation (used by getInstance internally)
    mockAxios.post.mockResolvedValue({ data: { accessToken: 'test-token', expiresIn: 3600 } });
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

      await expect(PortClient.getInstance()).rejects.toThrow('Invalid environment variables');
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
      expect(axios.post).toHaveBeenCalledWith('https://test.api.getport.io/v1/auth/access_token', {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
    });

    it('should regenerate token when expired', async () => {
      // getInstance uses the default mock (1st post call)
      const client = await PortClient.getInstance();

      // Expire the token
      (client as any).tokenExpiryTime = Date.now() - 1000;

      // ensureValidToken triggers another generateNewToken call (2nd post call)
      await (client as any).ensureValidToken();

      expect(axios.post).toHaveBeenCalledTimes(2); // Initial + regeneration
    });

    it('should retry request with new token on 401 error', async () => {
      // Create a valid client using the default mock (1st post call)
      const client = await PortClient.getInstance();

      // Set up a 401 error for the API call and a successful retry
      const error401: any = new Error('Unauthorized');
      error401.isAxiosError = true;
      error401.response = { status: 401 };
      mockAxios.isAxiosError.mockReturnValue(true);

      // First API call → 401, then new token is generated, then retry succeeds
      mockAxios
        .mockRejectedValueOnce(error401) // First axios(config) → 401
        .mockResolvedValueOnce({ data: { success: true } }); // Retry axios(config) → success

      const result = await client.get('/test-endpoint');

      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledTimes(2); // Initial token + refresh after 401
    });
  });

  describe('API methods', () => {
    it('should make authenticated GET request', async () => {
      const mockData = { success: true };
      // source calls axios(config) not axios.get(), so mock the default function
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.get('/test-endpoint');

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://test.api.getport.io/v1/test-endpoint',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });

    it('should make authenticated POST request', async () => {
      const mockData = { success: true };
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.post('/test-endpoint', { test: 'data' });

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://test.api.getport.io/v1/test-endpoint',
          data: { test: 'data' },
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });

    it('should make authenticated PATCH request', async () => {
      const mockData = { success: true };
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.patch('/test-endpoint', { test: 'data' });

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: 'https://test.api.getport.io/v1/test-endpoint',
          data: { test: 'data' },
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should make authenticated DELETE request', async () => {
      mockAxios.mockResolvedValueOnce({ data: null });

      const client = await PortClient.getInstance();
      await client.delete('/test-endpoint');

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: 'https://test.api.getport.io/v1/test-endpoint',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });
  });

  describe('entity operations', () => {
    it('should get entities for a blueprint', async () => {
      const mockData = { entities: [] };
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.getEntities('testBlueprint');

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://test.api.getport.io/v1/blueprints/testBlueprint/entities',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });

    it('should get entity by identifier', async () => {
      const mockData = { entity: {} };
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const client = await PortClient.getInstance();
      const result = await client.getEntity('testBlueprint', 'test-entity');

      expect(result).toEqual(mockData);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://test.api.getport.io/v1/blueprints/testBlueprint/entities/test-entity',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });

    it('should upsert entities in bulk', async () => {
      const mockResponse = {
        entities: [{ identifier: 'test', created: true, index: 0, additionalData: {} }],
        ok: true,
        errors: [],
      };
      mockAxios.mockResolvedValueOnce({ data: mockResponse });

      const client = await PortClient.getInstance();
      const result = await client.upsertEntities('testBlueprint', [
        {
          identifier: 'test',
          title: 'Test',
        },
      ]);

      expect(result).toEqual(mockResponse);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://test.api.getport.io/v1/blueprints/testBlueprint/entities/bulk?upsert=true&merge=true',
          data: { entities: [{ identifier: 'test', title: 'Test' }] },
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockAxios.mockRejectedValueOnce(new Error('Network error'));

      const client = await PortClient.getInstance();

      await expect(client.get('/test-endpoint')).rejects.toThrow('Network error');
    });

    it('should handle token refresh on 401', async () => {
      // Default mock handles initial token (1st post call)
      const client = await PortClient.getInstance();

      // Expire the token so ensureValidToken triggers a refresh
      (client as any).tokenExpiryTime = Date.now() - 1000;

      const mockData = { success: true };
      // After token refresh, the API call uses axios(config)
      mockAxios.mockResolvedValueOnce({ data: mockData });

      const result = await client.get('/test-endpoint');

      expect(result).toEqual(mockData);
      expect(axios.post).toHaveBeenCalledTimes(2); // Initial token + refresh
    });
  });

  describe('bulk entities', () => {
    it('should upsert multiple entities in bulk', async () => {
      const mockBulkResponse = {
        entities: [
          {
            identifier: 'entity1',
            created: true,
            index: 0,
            additionalData: {},
          },
          {
            identifier: 'entity2',
            created: true,
            index: 1,
            additionalData: {},
          },
        ],
        ok: true,
        errors: [],
      };

      mockAxios.mockResolvedValueOnce({ data: mockBulkResponse });

      const client = await PortClient.getInstance();
      const entities = [
        { identifier: 'entity1', title: 'Entity 1' },
        { identifier: 'entity2', title: 'Entity 2' },
      ];

      const result = await client.upsertEntities('test-blueprint', entities);

      expect(result).toEqual(mockBulkResponse);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://test.api.getport.io/v1/blueprints/test-blueprint/entities/bulk?upsert=true&merge=true',
          data: { entities },
        })
      );
    });

    it('should throw error when trying to upsert more than 20 entities', async () => {
      const client = await PortClient.getInstance();
      const entities = Array.from({ length: 21 }, (_, i) => ({
        identifier: `entity${i}`,
        title: `Entity ${i}`,
      }));

      await expect(client.upsertEntities('test-blueprint', entities)).rejects.toThrow(
        'Cannot upsert more than 20 entities in a single bulk request'
      );
    });
  });

  describe('upsertEntitiesInBatches', () => {
    it('should process entities in batches of 20', async () => {
      const mockBulkResponse1 = {
        entities: Array.from({ length: 20 }, (_, i) => ({
          identifier: `entity${i}`,
          created: true,
          index: i,
          additionalData: {},
        })),
        ok: true,
        errors: [],
      };

      const mockBulkResponse2 = {
        entities: Array.from({ length: 10 }, (_, i) => ({
          identifier: `entity${i + 20}`,
          created: true,
          index: i,
          additionalData: {},
        })),
        ok: true,
        errors: [],
      };

      // Default mock handles OAuth token (axios.post)
      // Batch requests go through axios(config) — mock the default function twice
      mockAxios
        .mockResolvedValueOnce({ data: mockBulkResponse1 }) // First batch
        .mockResolvedValueOnce({ data: mockBulkResponse2 }); // Second batch

      const entities = Array.from({ length: 30 }, (_, i) => ({
        identifier: `entity${i}`,
        title: `Entity ${i}`,
      }));

      const results = await upsertEntitiesInBatches('test-blueprint', entities);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockBulkResponse1);
      expect(results[1]).toEqual(mockBulkResponse2);
      // 1 OAuth post + 2 batch requests via axios(config)
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(mockAxios).toHaveBeenCalledTimes(2);
    });
  });
});
