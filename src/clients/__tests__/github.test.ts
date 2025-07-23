import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GitHubClient, TokenRotationManager, createGitHubClient } from '../github';

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

describe('GitHub Client Token Rotation', () => {
  describe('TokenRotationManager', () => {
    it('should initialize with multiple tokens', () => {
      const tokens = ['token1', 'token2', 'token3'];
      const manager = new TokenRotationManager(tokens);
      
      expect(manager.getAllTokens()).toEqual(tokens);
      expect(manager.getCurrentToken()).toBe('token1');
    });

    it('should filter out empty tokens', () => {
      const tokens = ['token1', '', 'token2', '   ', 'token3'];
      const manager = new TokenRotationManager(tokens);
      
      expect(manager.getAllTokens()).toEqual(['token1', 'token2', 'token3']);
    });

    it('should throw error for no valid tokens', () => {
      expect(() => new TokenRotationManager(['', '   '])).toThrow('At least one valid GitHub token is required');
    });

    it('should rotate to next available token', () => {
      const tokens = ['token1', 'token2', 'token3'];
      const manager = new TokenRotationManager(tokens);
      
      // Mark first token as unavailable
      manager.updateTokenStatus('token1', {
        remaining: 0,
        limit: 5000,
        resetTime: new Date(),
      });
      
      const nextToken = manager.rotateToNextAvailableToken();
      expect(nextToken).toBe('token2');
      expect(manager.getCurrentToken()).toBe('token2');
    });

    it('should return null when no tokens are available', () => {
      const tokens = ['token1', 'token2'];
      const manager = new TokenRotationManager(tokens);
      
      // Mark all tokens as unavailable
      manager.updateTokenStatus('token1', {
        remaining: 0,
        limit: 5000,
        resetTime: new Date(Date.now() + 3600000), // 1 hour from now
      });
      manager.updateTokenStatus('token2', {
        remaining: 0,
        limit: 5000,
        resetTime: new Date(Date.now() + 3600000), // 1 hour from now
      });
      
      const nextToken = manager.rotateToNextAvailableToken();
      expect(nextToken).toBeNull();
    });

    it('should reactivate tokens after reset time', () => {
      const tokens = ['token1', 'token2'];
      const manager = new TokenRotationManager(tokens);
      
      // Mark first token as unavailable with past reset time
      manager.updateTokenStatus('token1', {
        remaining: 0,
        limit: 5000,
        resetTime: new Date(Date.now() - 1000), // 1 second ago
      });
      
      // Mark second token as unavailable with future reset time
      manager.updateTokenStatus('token2', {
        remaining: 0,
        limit: 5000,
        resetTime: new Date(Date.now() + 3600000), // 1 hour from now
      });
      
      const nextToken = manager.rotateToNextAvailableToken();
      expect(nextToken).toBe('token1');
    });
  });

  describe('GitHubClient', () => {
    it('should create client with single token', () => {
      const client = new GitHubClient('single-token');
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should create client with multiple tokens', () => {
      const tokens = ['token1', 'token2', 'token3'];
      const client = new GitHubClient(tokens);
      expect(client).toBeInstanceOf(GitHubClient);
    });
  });

  describe('createGitHubClient factory', () => {
    it('should handle single token (backward compatibility)', () => {
      const client = createGitHubClient('single-token');
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should handle comma-separated tokens', () => {
      const client = createGitHubClient('token1,token2,token3');
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should handle tokens with spaces', () => {
      const client = createGitHubClient('token1, token2 , token3');
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should throw error for empty token list', () => {
      expect(() => createGitHubClient('')).toThrow('At least one valid GitHub token is required');
      expect(() => createGitHubClient(',,')).toThrow('At least one valid GitHub token is required');
    });
  });
}); 