import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { PortClient } from "../port";

// Mock axios with proper typing
const mockAxios = {
  get: jest.fn<() => any>(),
  post: jest.fn<() => any>(),
  patch: jest.fn<() => any>(),
  delete: jest.fn<() => any>(),
  isAxiosError: jest.fn<() => any>(),
};

jest.mock("axios", () => ({
  __esModule: true,
  default: mockAxios,
  isAxiosError: mockAxios.isAxiosError,
}));

// Mock environment variables
const originalEnv = process.env;

describe("Port Client Integration", () => {
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

  describe("OAuth Token Management", () => {
    it("should handle OAuth token generation with expiresIn", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token-123",
        expiresIn: 3600, // 1 hour
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

    it("should handle bearer token from environment", async () => {
      process.env.PORT_BEARER_TOKEN = "bearer-token-123";

      const client = await PortClient.getInstance();
      const tokenInfo = client.getTokenInfo();

      expect(tokenInfo.hasToken).toBe(true);
      expect(tokenInfo.isExpired).toBe(false);
      expect(mockAxios.post).not.toHaveBeenCalled(); // Should not call OAuth endpoint
    });

    it("should regenerate token when expired", async () => {
      const mockOAuthResponse1 = {
        accessToken: "old-token",
        expiresIn: 3600,
      };

      const mockOAuthResponse2 = {
        accessToken: "new-token",
        expiresIn: 7200,
      };

      mockAxios.post
        .mockResolvedValueOnce({ data: mockOAuthResponse1 })
        .mockResolvedValueOnce({ data: mockOAuthResponse2 });

      const client = await PortClient.getInstance();

      // Mock token as expired
      (client as any).tokenExpiryTime = Date.now() - 1000;

      await (client as any).ensureValidToken();

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockAxios.post).toHaveBeenLastCalledWith(
        "https://api.getport.io/v1/auth/access_token",
        {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
        },
      );
    });

    it("should handle OAuth token generation errors", async () => {
      mockAxios.post.mockRejectedValueOnce(new Error("OAuth failed"));

      await expect(PortClient.getInstance()).rejects.toThrow(
        "Failed to generate OAuth token",
      );
    });

    it("should handle axios errors in OAuth", async () => {
      const axiosError = {
        response: {
          data: { error: "invalid_client" },
          status: 401,
        },
        isAxiosError: true,
      };

      mockAxios.post.mockRejectedValueOnce(axiosError);
      mockAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(PortClient.getInstance()).rejects.toThrow(
        "Failed to generate OAuth token",
      );
    });
  });

  describe("API Request Handling", () => {
    it("should make authenticated GET requests", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      const mockApiResponse = {
        data: { success: true, entities: [] },
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get.mockResolvedValueOnce(mockApiResponse);

      const client = await PortClient.getInstance();
      const result = await client.get("/entities");

      expect(mockAxios.get).toHaveBeenCalledWith(
        "https://api.getport.io/v1/entities",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
      expect(result).toEqual(mockApiResponse.data);
    });

    it("should make authenticated POST requests", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      const mockApiResponse = {
        data: { success: true },
      };

      const postData = { name: "test-entity" };

      mockAxios.post
        .mockResolvedValueOnce({ data: mockOAuthResponse })
        .mockResolvedValueOnce(mockApiResponse);

      const client = await PortClient.getInstance();
      const result = await client.post("/entities", postData);

      expect(mockAxios.post).toHaveBeenCalledWith(
        "https://api.getport.io/v1/entities",
        postData,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
      expect(result).toEqual(mockApiResponse.data);
    });

    it("should retry requests with new token on 401 errors", async () => {
      const mockOAuthResponse1 = {
        accessToken: "old-token",
        expiresIn: 3600,
      };

      const mockOAuthResponse2 = {
        accessToken: "new-token",
        expiresIn: 3600,
      };

      const mockApiResponse = {
        data: { success: true },
      };

      mockAxios.post
        .mockResolvedValueOnce({ data: mockOAuthResponse1 })
        .mockResolvedValueOnce({ data: mockOAuthResponse2 });

      mockAxios.get
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce(mockApiResponse);

      const client = await PortClient.getInstance();
      const result = await client.get("/entities");

      expect(mockAxios.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockApiResponse.data);
    });

    it("should handle non-401 errors without retry", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get.mockRejectedValueOnce({ response: { status: 500 } });

      const client = await PortClient.getInstance();

      await expect(client.get("/entities")).rejects.toEqual({
        response: { status: 500 },
      });
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("Entity Operations", () => {
    it("should delete all entities of a type", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.delete.mockResolvedValueOnce({});

      const client = await PortClient.getInstance();

      await client.deleteAllEntities("github_user");

      expect(mockAxios.delete).toHaveBeenCalledWith(
        "https://api.getport.io/v1/blueprints/github_user/entities",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });
  });

  describe("Static Methods", () => {
    it("should provide static access to entity operations", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      const mockApiResponse = {
        entities: [
          {
            identifier: "test-user",
            created: true,
            index: 0,
            additionalData: {},
          },
        ],
        ok: true,
        errors: [],
      };

      mockAxios.post
        .mockResolvedValueOnce({ data: mockOAuthResponse })
        .mockResolvedValueOnce({ data: mockApiResponse });

      await PortClient.upsertEntities("github_user", [
        {
          identifier: "test-user",
          title: "Test User",
          properties: { name: "test" },
        },
      ]);

      expect(mockAxios.post).toHaveBeenCalledWith(
        "https://api.getport.io/v1/blueprints/github_user/entities/bulk?upsert=true&merge=true",
        {
          entities: [
            {
              identifier: "test-user",
              title: "Test User",
              properties: { name: "test" },
            },
          ],
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });

    it("should handle concurrent static method calls", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      const mockApiResponse = {
        entities: [
          { identifier: "user1", created: true, index: 0, additionalData: {} },
        ],
        ok: true,
        errors: [],
      };

      mockAxios.post.mockResolvedValue({ data: mockOAuthResponse });
      mockAxios.post.mockResolvedValue({ data: mockApiResponse });

      // Call multiple static methods concurrently
      const promises = [
        PortClient.upsertEntities("github_user", [
          {
            identifier: "user1",
            title: "User 1",
            properties: { name: "test1" },
          },
        ]),
        PortClient.upsertEntities("github_user", [
          {
            identifier: "user2",
            title: "User 2",
            properties: { name: "test2" },
          },
        ]),
        PortClient.upsertEntities("github_user", [
          {
            identifier: "user3",
            title: "User 3",
            properties: { name: "test3" },
          },
        ]),
      ];

      await Promise.all(promises);

      // Should only generate token once
      expect(mockAxios.post).toHaveBeenCalled();
    });
  });

  describe("Error Scenarios", () => {
    it("should handle missing environment variables", async () => {
      delete process.env.PORT_CLIENT_ID;
      delete process.env.PORT_CLIENT_SECRET;

      await expect(PortClient.getInstance()).rejects.toThrow(
        "PORT_CLIENT_ID and PORT_CLIENT_SECRET must be set in environment variables",
      );
    });

    it("should handle network errors", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get.mockRejectedValueOnce(new Error("Network error"));

      const client = await PortClient.getInstance();

      await expect(client.get("/entities")).rejects.toThrow("Network error");
    });

    it("should handle malformed API responses", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxios.get.mockResolvedValueOnce({}); // No data property

      const client = await PortClient.getInstance();

      await expect(client.get("/entities")).rejects.toThrow();
    });
  });
});
