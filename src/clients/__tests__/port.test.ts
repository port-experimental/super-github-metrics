import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

// Mock axios before imports
jest.mock("axios", () => {
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

import axios from "axios";
import { PortClient, upsertEntitiesInBatches } from "../port";

// Get reference to the mocked axios
const mockAxios: any = axios;

// Mock environment variables
const originalEnv = process.env;

describe("PortClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PORT_CLIENT_ID: "test-client-id",
      PORT_CLIENT_SECRET: "test-client-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("getInstance", () => {
    it("should create a singleton instance", async () => {
      const instance1 = await PortClient.getInstance();
      const instance2 = await PortClient.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(PortClient);
    });

    it("should throw error if environment variables are missing", async () => {
      delete process.env.PORT_CLIENT_ID;
      delete process.env.PORT_CLIENT_SECRET;

      await expect(PortClient.getInstance()).rejects.toThrow(
        "PORT_CLIENT_ID and PORT_CLIENT_SECRET must be set in environment variables",
      );
    });
  });

  describe("token management", () => {
    it("should initialize token on first request", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      const tokenInfo = client.getTokenInfo();

      expect(tokenInfo.hasToken).toBe(true);
      expect(tokenInfo.isExpired).toBe(false);
      expect(axios.post).toHaveBeenCalledWith(
        "https://api.getport.io/v1/auth/access_token",
        {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
        },
      );
    });

    it("should regenerate token when expired", async () => {
      const mockOAuthResponse = {
        accessToken: "new-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();

      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;

      await (client as any).ensureValidToken();

      expect(axios.post).toHaveBeenCalledTimes(2); // Initial + regeneration
    });

    it("should retry request with new token on 401 error", async () => {
      const mockOAuthResponse = {
        accessToken: "new-token",
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

  describe("API methods", () => {
    it("should make authenticated GET request", async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.get("/test-endpoint");

      expect(result).toEqual(mockResponse.data);
      expect(axios.get).toHaveBeenCalledWith("/test-endpoint", {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer"),
        }),
      });
    });

    it("should make authenticated POST request", async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.post("/test-endpoint", { test: "data" });

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith(
        "/test-endpoint",
        { test: "data" },
        {
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
          }),
        },
      );
    });

    it("should make authenticated PATCH request", async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.patch.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.patch("/test-endpoint", { test: "data" });

      expect(result).toEqual(mockResponse.data);
      expect(axios.patch).toHaveBeenCalledWith(
        "/test-endpoint",
        { test: "data" },
        {
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        },
      );
    });

    it("should make authenticated DELETE request", async () => {
      mockAxios.delete.mockResolvedValueOnce({});

      const client = await PortClient.getInstance();
      await client.delete("/test-endpoint");

      expect(axios.delete).toHaveBeenCalledWith("/test-endpoint", {
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer"),
        }),
      });
    });
  });

  describe("entity operations", () => {
    it("should get entities for a blueprint", async () => {
      const mockResponse = { data: { entities: [] } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.getEntities("testBlueprint");

      expect(result).toEqual({ entities: [] });
      expect(axios.get).toHaveBeenCalledWith(
        "/blueprints/testBlueprint/entities",
        {
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
          }),
        },
      );
    });

    it("should get entity by identifier", async () => {
      const mockResponse = { data: { entity: {} } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const client = await PortClient.getInstance();
      const result = await client.getEntity("testBlueprint", "test-entity");

      expect(result).toEqual({ entity: {} });
      expect(axios.get).toHaveBeenCalledWith(
        "/blueprints/testBlueprint/entities/test-entity",
        {
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
          }),
        },
      );
    });

    it("should upsert entities in bulk", async () => {
      const mockResponse = {
        entities: [
          { identifier: "test", created: true, index: 0, additionalData: {} },
        ],
        ok: true,
        errors: [],
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const client = await PortClient.getInstance();
      const result = await client.upsertEntities("testBlueprint", [
        {
          identifier: "test",
          title: "Test",
        },
      ]);

      expect(result).toEqual(mockResponse);
      expect(axios.post).toHaveBeenCalledWith(
        "https://api.getport.io/v1/blueprints/testBlueprint/entities/bulk?upsert=true&merge=true",
        { entities: [{ identifier: "test", title: "Test" }] },
        expect.any(Object),
      );
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      mockAxios.get.mockRejectedValueOnce(new Error("Network error"));

      const client = await PortClient.getInstance();

      await expect(client.get("/test-endpoint")).rejects.toThrow(
        "Network error",
      );
    });

    it("should handle token refresh on 401", async () => {
      const mockOAuthResponse = {
        accessToken: "new-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get.mockResolvedValueOnce({ data: { success: true } });

      const client = await PortClient.getInstance();

      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;

      const result = await client.get("/test-endpoint");

      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledTimes(2); // Initial + refresh
    });
  });

  describe("bulk entities", () => {
    it("should upsert multiple entities in bulk", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      const mockBulkResponse = {
        entities: [
          {
            identifier: "entity1",
            created: true,
            index: 0,
            additionalData: {},
          },
          {
            identifier: "entity2",
            created: true,
            index: 1,
            additionalData: {},
          },
        ],
        ok: true,
        errors: [],
      };

      mockAxios.post
        .mockResolvedValueOnce({ data: mockOAuthResponse }) // OAuth token
        .mockResolvedValueOnce({ data: mockBulkResponse }); // Bulk upsert

      const client = await PortClient.getInstance();
      const entities = [
        { identifier: "entity1", title: "Entity 1" },
        { identifier: "entity2", title: "Entity 2" },
      ];

      const result = await client.upsertEntities("test-blueprint", entities);

      expect(result).toEqual(mockBulkResponse);
      expect(axios.post).toHaveBeenCalledWith(
        "https://api.getport.io/v1/blueprints/test-blueprint/entities/bulk?upsert=true&merge=true",
        { entities },
        expect.any(Object),
      );
    });

    it("should throw error when trying to upsert more than 20 entities", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });

      const client = await PortClient.getInstance();
      const entities = Array.from({ length: 21 }, (_, i) => ({
        identifier: `entity${i}`,
        title: `Entity ${i}`,
      }));

      await expect(
        client.upsertEntities("test-blueprint", entities),
      ).rejects.toThrow(
        "Cannot upsert more than 20 entities in a single bulk request",
      );
    });
  });

  describe("upsertEntitiesInBatches", () => {
    it("should process entities in batches of 20", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

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

      mockAxios.post
        .mockResolvedValueOnce({ data: mockOAuthResponse }) // OAuth token
        .mockResolvedValueOnce({ data: mockBulkResponse1 }) // First batch
        .mockResolvedValueOnce({ data: mockBulkResponse2 }); // Second batch

      const entities = Array.from({ length: 30 }, (_, i) => ({
        identifier: `entity${i}`,
        title: `Entity ${i}`,
      }));

      const results = await upsertEntitiesInBatches("test-blueprint", entities);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockBulkResponse1);
      expect(results[1]).toEqual(mockBulkResponse2);
      expect(axios.post).toHaveBeenCalledTimes(3); // OAuth + 2 batches
    });
  });
});
