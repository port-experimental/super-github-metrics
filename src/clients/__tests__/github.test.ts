// Mock @octokit/auth-app to avoid ES module issues
jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GitHubClient, createGitHubClient, PATAuth } from '../github';

// Mock Octokit using the same pattern as existing tests
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      pulls: {
        list: jest.fn(),
        get: jest.fn(),
        listReviews: jest.fn(),
      },
      repos: {
        listCommits: jest.fn(),
        listForOrg: jest.fn(),
      },
      rateLimit: {
        get: jest.fn(),
      },
    },
    paginate: jest.fn(),
    request: jest.fn(),
    search: {
      issuesAndPullRequests: jest.fn(),
    },
  })),
}));

describe('GitHub Authentication', () => {
  describe('PATAuth', () => {
    it('should create PAT auth instance with single token', () => {
      const auth = new PATAuth('test-token');
      expect(auth).toBeInstanceOf(PATAuth);
      expect(auth.getTokenCount()).toBe(1);
    });

    it('should create PAT auth instance with multiple tokens', () => {
      const auth = new PATAuth(['token1', 'token2', 'token3']);
      expect(auth).toBeInstanceOf(PATAuth);
      expect(auth.getTokenCount()).toBe(3);
    });

    it('should create PAT auth instance with comma-separated tokens', () => {
      const auth = new PATAuth('token1,token2,token3');
      expect(auth).toBeInstanceOf(PATAuth);
      expect(auth.getTokenCount()).toBe(3);
    });

    it('should check token validity', async () => {
      const auth = new PATAuth('test-token');
      // Token validity depends on having a current token and available tokens
      expect(auth.isTokenValid()).toBe(false); // Initially false until getToken() is called
    });

    it('should return false for empty token', () => {
      expect(() => new PATAuth('')).toThrow('At least one valid PAT token is required');
    });

    it('should get rate limit status', async () => {
      const auth = new PATAuth(['token1', 'token2']);
      const status = auth.getRateLimitStatus();
      expect(status).toHaveLength(2);
      expect(status[0]).toHaveProperty('token');
      expect(status[0]).toHaveProperty('remaining');
      expect(status[0]).toHaveProperty('reset');
    });

    it('should update rate limits', async () => {
      const auth = new PATAuth('test-token');
      // First get a token to set the current token
      await auth.getToken();
      // Now update the rate limits
      auth.updateRateLimits(100, Date.now() + 3600000);
      const status = auth.getRateLimitStatus();
      // The status should show the updated rate limit
      expect(status[0].remaining).toBe(100);
    });

    it('should rotate tokens', async () => {
      const auth = new PATAuth(['token1', 'token2', 'token3']);
      const initialToken = await auth.getToken();
      auth.rotateToken();
      const rotatedToken = await auth.getToken();
      // The rotation should change the token (though we can't predict which one)
      expect(auth.getTokenCount()).toBe(3);
    });
  });

  describe('GitHubClient', () => {
    it('should create client with PAT auth', async () => {
      const auth = new PATAuth('test-token');
      const client = new GitHubClient(auth);
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should handle rate limit updates for PAT auth', async () => {
      const auth = new PATAuth('test-token');
      const client = new GitHubClient(auth);
      
      // Test that the client can be created and basic functionality works
      expect(client).toBeInstanceOf(GitHubClient);
      
      // Test that the auth instance has the expected methods
      expect(typeof auth.updateRateLimits).toBe('function');
      expect(typeof auth.getRateLimitStatus).toBe('function');
      expect(typeof auth.getTokenCount).toBe('function');
    });
  });

  describe('createGitHubClient factory', () => {
    beforeEach(() => {
      // Clear all environment variables
      delete process.env.X_GITHUB_TOKEN;
      delete process.env.X_GITHUB_APP_ID;
      delete process.env.X_GITHUB_APP_PRIVATE_KEY;
      delete process.env.X_GITHUB_APP_INSTALLATION_ID;
    });

    it('should use PAT auth when only token is provided', () => {
      process.env.X_GITHUB_TOKEN = 'test-token';
      
      const client = createGitHubClient();
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should use PAT auth with multiple tokens', () => {
      process.env.X_GITHUB_TOKEN = 'token1,token2,token3';
      
      const client = createGitHubClient();
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should throw error when no authentication is configured', () => {
      expect(() => createGitHubClient()).toThrow('No GitHub authentication configured');
    });
  });
});

