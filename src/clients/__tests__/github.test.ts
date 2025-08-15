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
    it('should create PAT auth instance', () => {
      const auth = new PATAuth({ token: 'test-token' });
      expect(auth).toBeInstanceOf(PATAuth);
    });

    it('should check token validity', () => {
      const auth = new PATAuth({ token: 'test-token' });
      expect(auth.isTokenValid()).toBe(true);
    });

    it('should return false for empty token', () => {
      const auth = new PATAuth({ token: '' });
      expect(auth.isTokenValid()).toBe(false);
    });
  });

  describe('GitHubClient', () => {
    it('should create client with PAT auth', () => {
      const auth = new PATAuth({ token: 'test-token' });
      const client = new GitHubClient(auth);
      expect(client).toBeInstanceOf(GitHubClient);
    });
  });

  describe('createGitHubClient factory', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
      // Clear all GitHub-related environment variables
      delete process.env.X_GITHUB_TOKEN;
      delete process.env.X_GITHUB_APP_ID;
      delete process.env.X_GITHUB_APP_PRIVATE_KEY;
      delete process.env.X_GITHUB_APP_INSTALLATION_ID;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use PAT auth when only token is provided', () => {
      process.env.X_GITHUB_TOKEN = 'test-token';

      const client = createGitHubClient();
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should throw error when no authentication is configured', () => {
      expect(() => createGitHubClient()).toThrow('No GitHub authentication configured');
    });
  });
});
