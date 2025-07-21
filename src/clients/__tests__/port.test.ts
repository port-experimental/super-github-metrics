import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PortClient } from '../port';
import { mockAxios } from '../../__tests__/utils/mocks';

// Mock axios
jest.mock('axios', () => mockAxios);

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
        access_token: 'test-token',
        expires_in: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      const tokenInfo = client.getTokenInfo();

      expect(tokenInfo.hasToken).toBe(true);
      expect(tokenInfo.isExpired).toBe(false);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.getport.io/v1/auth/access_token',
        {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        }
      );
    });

    it('should regenerate token when expired', async () => {
      const mockOAuthResponse = {
        access_token: 'new-token',
        expires_in: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      
      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;
      
      await (client as any).ensureValidToken();

      expect(mockAxios.post).toHaveBeenCalledTimes(2); // Initial + regeneration
    });

    it('should retry request with new token on 401 error', async () => {
      const mockOAuthResponse = {
        access_token: 'new-token',
        expires_in: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({ data: { success: true } });

      const client = await PortClient.getInstance();
      await client.get('/test-endpoint');

      expect(mockAxios.get).toHaveBeenCalledTimes(2);
      expect(mockAxios.post).toHaveBeenCalledTimes(2); // Initial + regeneration
    });
  });

  describe('HTTP methods', () => {
    let client: PortClient;

    beforeEach(async () => {
      const mockOAuthResponse = {
        access_token: 'test-token',
        expires_in: 3600,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      client = await PortClient.getInstance();
    });

    describe('get', () => {
      it('should make GET request with authentication', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await client.get('/test-endpoint');

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.get).toHaveBeenCalledWith(
          'https://api.getport.io/v1/test-endpoint',
          {
            headers: {
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            },
          }
        );
      });

      it('should make GET request with query parameters', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await client.get('/test-endpoint', { param1: 'value1' });

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.get).toHaveBeenCalledWith(
          'https://api.getport.io/v1/test-endpoint?param1=value1',
          {
            headers: {
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            },
          }
        );
      });
    });

    describe('post', () => {
      it('should make POST request with data', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.post.mockResolvedValueOnce(mockResponse);

        const data = { key: 'value' };
        const result = await client.post('/test-endpoint', data);

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.post).toHaveBeenCalledWith(
          'https://api.getport.io/v1/test-endpoint',
          data,
          {
            headers: {
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            },
          }
        );
      });
    });

    describe('patch', () => {
      it('should make PATCH request with data', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.patch.mockResolvedValueOnce(mockResponse);

        const data = { key: 'value' };
        const result = await client.patch('/test-endpoint', data);

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.patch).toHaveBeenCalledWith(
          'https://api.getport.io/v1/test-endpoint',
          data,
          {
            headers: {
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            },
          }
        );
      });
    });

    describe('delete', () => {
      it('should make DELETE request', async () => {
        mockAxios.delete.mockResolvedValueOnce({});

        await client.delete('/test-endpoint');

        expect(mockAxios.delete).toHaveBeenCalledWith(
          'https://api.getport.io/v1/test-endpoint',
          {
            headers: {
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            },
          }
        );
      });
    });
  });

  describe('entity management', () => {
    let client: PortClient;

    beforeEach(async () => {
      const mockOAuthResponse = {
        access_token: 'test-token',
        expires_in: 3600,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      client = await PortClient.getInstance();
    });

    describe('getEntities', () => {
      it('should fetch entities for a blueprint', async () => {
        const mockResponse = { data: { entities: [] } };
        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await client.getEntities('testBlueprint');

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.get).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/entities',
          expect.any(Object)
        );
      });
    });

    describe('getEntity', () => {
      it('should fetch a specific entity', async () => {
        const mockResponse = { data: { entity: {} } };
        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await client.getEntity('testBlueprint', 'testId');

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.get).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/entities/testId',
          expect.any(Object)
        );
      });
    });

    describe('upsertProps', () => {
      it('should upsert entity properties', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.patch.mockResolvedValueOnce(mockResponse);

        const properties = { prop1: 'value1' };
        const result = await client.upsertProps('testBlueprint', 'testId', properties);

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.patch).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/entities/testId',
          { properties },
          expect.any(Object)
        );
      });
    });

    describe('upsertEntity', () => {
      it('should upsert a complete entity', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.patch.mockResolvedValueOnce(mockResponse);

        const entity = {
          title: 'Test Entity',
          properties: { prop1: 'value1' },
          relations: { rel1: 'value1' },
        };

        const result = await client.upsertEntity(
          'testBlueprint',
          'testId',
          entity.title,
          entity.properties,
          entity.relations
        );

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.patch).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/entities/testId',
          entity,
          expect.any(Object)
        );
      });
    });

    describe('createEntity', () => {
      it('should create a new entity', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.post.mockResolvedValueOnce(mockResponse);

        const entity = {
          identifier: 'testId',
          title: 'Test Entity',
          properties: { prop1: 'value1' },
        };

        const result = await client.createEntity('testBlueprint', entity);

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.post).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/entities',
          entity,
          expect.any(Object)
        );
      });
    });

    describe('updateEntity', () => {
      it('should update an existing entity', async () => {
        const mockResponse = { data: { success: true } };
        mockAxios.patch.mockResolvedValueOnce(mockResponse);

        const entity = {
          identifier: 'testId',
          title: 'Test Entity',
          properties: { prop1: 'value1' },
        };

        const result = await client.updateEntity('testBlueprint', entity);

        expect(result).toEqual(mockResponse.data);
        expect(mockAxios.patch).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/entities/testId',
          entity,
          expect.any(Object)
        );
      });
    });

    describe('deleteAllEntities', () => {
      it('should delete all entities of a type', async () => {
        mockAxios.delete.mockResolvedValueOnce({});

        await client.deleteAllEntities('testBlueprint');

        expect(mockAxios.delete).toHaveBeenCalledWith(
          'https://api.getport.io/v1/blueprints/testBlueprint/all-entities',
          expect.any(Object)
        );
      });
    });
  });

  describe('static methods', () => {
    beforeEach(async () => {
      const mockOAuthResponse = {
        access_token: 'test-token',
        expires_in: 3600,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
    });

    it('should provide static access to instance methods', async () => {
      const mockResponse = { data: { entities: [] } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await PortClient.getEntities('testBlueprint');

      expect(result).toEqual(mockResponse.data);
    });

    it('should provide static access to user methods', async () => {
      const mockResponse = { data: { entities: [] } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await PortClient.getUsers();

      expect(result).toEqual(mockResponse.data);
    });
  });
}); 