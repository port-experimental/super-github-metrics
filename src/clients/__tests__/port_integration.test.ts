import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { PortClient } from "../port";

// Types for axios mock
interface AxiosRequestConfig {
  method: string;
  url: string;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface AxiosResponse<T = unknown> {
  data: T;
  status?: number;
}

// Mock axios with proper typing
const mockAxiosInstance = jest.fn<() => Promise<AxiosResponse>>();
const mockAxiosPost = jest.fn<() => Promise<AxiosResponse>>();
const mockAxiosGet = jest.fn<() => Promise<AxiosResponse>>();
const mockAxiosPatch = jest.fn<() => Promise<AxiosResponse>>();
const mockAxiosDelete = jest.fn<() => Promise<AxiosResponse>>();
const mockIsAxiosError = jest.fn<() => boolean>();

// Setup the axios mock implementation
mockAxiosInstance.mockImplementation((config: AxiosRequestConfig) => {
  if (config.method === "GET") {
    return mockAxiosGet(config.url, config);
  } else if (config.method === "POST") {
    return mockAxiosPost(config.url, config.data, config);
  } else if (config.method === "PATCH") {
    return mockAxiosPatch(config.url, config.data, config);
  } else if (config.method === "DELETE") {
    return mockAxiosDelete(config.url, config);
  }
  throw new Error(`Unsupported method: ${config.method}`);
});

jest.mock("axios", () => {
  const axiosFn = (config: AxiosRequestConfig) => {
    if (config.method === "GET") {
      return mockAxiosGet(config.url, config);
    } else if (config.method === "POST") {
      return mockAxiosPost(config.url, config.data, config);
    } else if (config.method === "PATCH") {
      return mockAxiosPatch(config.url, config.data, config);
    } else if (config.method === "DELETE") {
      return mockAxiosDelete(config.url, config);
    }
    throw new Error(`Unsupported method: ${config.method}`);
  };
  axiosFn.post = mockAxiosPost;
  axiosFn.get = mockAxiosGet;
  axiosFn.patch = mockAxiosPatch;
  axiosFn.delete = mockAxiosDelete;
  axiosFn.isAxiosError = mockIsAxiosError;

  return {
    __esModule: true,
    default: axiosFn,
    isAxiosError: mockIsAxiosError,
  };
});

// Mock environment variables
const originalEnv = process.env;

describe("Port Client Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton instance before each test
    (PortClient as unknown as { instance: PortClient | null }).instance = null;
    process.env = {
      ...originalEnv,
      PORT_CLIENT_ID: "test-client-id",
      PORT_CLIENT_SECRET: "test-client-secret",
      PORT_BASE_URL: "https://api.getport.io/v1",
    };
    // Clear bearer token
    delete process.env.PORT_BEARER_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    // Reset the singleton instance after each test
    (PortClient as unknown as { instance: PortClient | null }).instance = null;
    jest.restoreAllMocks();
  });

  describe("OAuth Token Management", () => {
    it("should handle OAuth token generation with expiresIn", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token-123",
        expiresIn: 3600, // 1 hour
      };

      mockAxiosPost.mockResolvedValueOnce({ data: mockOAuthResponse });

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
      expect(mockAxiosPost).not.toHaveBeenCalled(); // Should not call OAuth endpoint
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

      mockAxiosPost
        .mockResolvedValueOnce({ data: mockOAuthResponse1 })
        .mockResolvedValueOnce({ data: mockOAuthResponse2 });

      const client = await PortClient.getInstance();

      // Mock token as expired
      (client as unknown as { tokenExpiryTime: number }).tokenExpiryTime =
        Date.now() - 1000;

      await (
        client as unknown as { ensureValidToken: () => Promise<void> }
      ).ensureValidToken();

      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
      expect(mockAxiosPost).toHaveBeenLastCalledWith(
        "https://api.getport.io/v1/auth/access_token",
        {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
        },
      );
    });

    it("should handle OAuth token generation errors", async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error("OAuth failed"));

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

      mockAxiosPost.mockRejectedValueOnce(axiosError);
      mockIsAxiosError.mockReturnValueOnce(true);

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

      mockAxiosPost.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxiosGet.mockResolvedValueOnce(mockApiResponse);

      const client = await PortClient.getInstance();
      const result = await client.get("/entities");

      expect(mockAxiosGet).toHaveBeenCalledWith(
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

      mockAxiosPost
        .mockResolvedValueOnce({ data: mockOAuthResponse })
        .mockResolvedValueOnce(mockApiResponse);

      const client = await PortClient.getInstance();
      const result = await client.post("/entities", postData);

      expect(mockAxiosPost).toHaveBeenLastCalledWith(
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

      const error401 = { response: { status: 401 } };

      mockAxiosPost
        .mockResolvedValueOnce({ data: mockOAuthResponse1 })
        .mockResolvedValueOnce({ data: mockOAuthResponse2 });

      mockAxiosGet
        .mockRejectedValueOnce(error401)
        .mockResolvedValueOnce(mockApiResponse);

      mockIsAxiosError.mockReturnValue(true);

      const client = await PortClient.getInstance();
      const result = await client.get("/entities");

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockApiResponse.data);
    });

    it("should handle non-401 errors without retry", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      const error500 = { response: { status: 500 } };

      mockAxiosPost.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxiosGet.mockRejectedValueOnce(error500);
      mockIsAxiosError.mockReturnValue(false);

      const client = await PortClient.getInstance();

      await expect(client.get("/entities")).rejects.toEqual(error500);
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    });
  });

  describe("Entity Operations", () => {
    it("should delete all entities of a type", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxiosPost.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxiosDelete.mockResolvedValueOnce({ data: {} });

      const client = await PortClient.getInstance();

      await client.deleteAllEntities("github_user");

      expect(mockAxiosDelete).toHaveBeenCalledWith(
        "https://api.getport.io/v1/blueprints/github_user/all-entities",
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

      mockAxiosPost
        .mockResolvedValueOnce({ data: mockOAuthResponse })
        .mockResolvedValueOnce({ data: mockApiResponse });

      await PortClient.upsertEntities("github_user", [
        {
          identifier: "test-user",
          title: "Test User",
          properties: { name: "test" },
        },
      ]);

      expect(mockAxiosPost).toHaveBeenLastCalledWith(
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

      // First call gets OAuth, subsequent calls get API response
      mockAxiosPost
        .mockResolvedValueOnce({ data: mockOAuthResponse })
        .mockResolvedValue({ data: mockApiResponse });

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

      // Should have called post for OAuth + 3 upsert calls
      expect(mockAxiosPost).toHaveBeenCalled();
    });
  });

  describe("Error Scenarios", () => {
    it("should handle missing environment variables", async () => {
      delete process.env.PORT_CLIENT_ID;
      delete process.env.PORT_CLIENT_SECRET;
      delete process.env.PORT_BASE_URL;

      await expect(PortClient.getInstance()).rejects.toThrow(
        "Invalid environment variables",
      );
    });

    it("should handle network errors", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxiosPost.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxiosGet.mockRejectedValueOnce(new Error("Network error"));
      mockIsAxiosError.mockReturnValue(false);

      const client = await PortClient.getInstance();

      await expect(client.get("/entities")).rejects.toThrow("Network error");
    });

    it("should handle responses without data property", async () => {
      const mockOAuthResponse = {
        accessToken: "test-token",
        expiresIn: 3600,
      };

      mockAxiosPost.mockResolvedValueOnce({ data: mockOAuthResponse });
      mockAxiosGet.mockResolvedValueOnce({}); // No data property

      const client = await PortClient.getInstance();
      const result = await client.get("/entities");

      // The client returns response.data which will be undefined
      expect(result).toBeUndefined();
    });
  });
});
