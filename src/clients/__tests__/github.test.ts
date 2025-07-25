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

    it('should find best available token with most remaining requests', () => {
      const tokens = ['token1', 'token2', 'token3'];
      const manager = new TokenRotationManager(tokens);
      
      // Set different remaining requests for each token
      manager.updateTokenStatus('token1', {
        remaining: 100,
        limit: 5000,
        resetTime: new Date(),
      });
      manager.updateTokenStatus('token2', {
        remaining: 500,
        limit: 5000,
        resetTime: new Date(),
      });
      manager.updateTokenStatus('token3', {
        remaining: 50,
        limit: 5000,
        resetTime: new Date(),
      });
      
      const bestToken = manager.findBestAvailableToken();
      expect(bestToken).toBe('token2'); // Should return token with most remaining requests
    });

    it('should find best token considering reset times', () => {
      const tokens = ['token1', 'token2', 'token3'];
      const manager = new TokenRotationManager(tokens);
      const now = new Date();
      
      // Token 1: Available with 100 requests
      manager.updateTokenStatus('token1', {
        remaining: 100,
        limit: 5000,
        resetTime: now,
      });
      
      // Token 2: Unavailable but resets in 1 minute (high score)
      const resetIn1Min = new Date(now.getTime() + 60 * 1000);
      manager.updateTokenStatus('token2', {
        remaining: 0,
        limit: 5000,
        resetTime: resetIn1Min,
      });
      
      // Token 3: Unavailable and resets in 60 minutes (low score)
      const resetIn60Min = new Date(now.getTime() + 60 * 60 * 1000);
      manager.updateTokenStatus('token3', {
        remaining: 0,
        limit: 5000,
        resetTime: resetIn60Min,
      });
      
      const bestToken = manager.findBestAvailableToken();
      // Token 2 should be selected because it resets soon (score ~5000/1 = 5000)
      // vs Token 1 with 100 requests or Token 3 with score ~5000/60 = 83
      expect(bestToken).toBe('token2');
    });

    it('should prefer available tokens over unavailable ones with long reset times', () => {
      const tokens = ['token1', 'token2'];
      const manager = new TokenRotationManager(tokens);
      const now = new Date();
      
      // Token 1: Available with 50 requests
      manager.updateTokenStatus('token1', {
        remaining: 50,
        limit: 5000,
        resetTime: now,
      });
      
      // Token 2: Unavailable and resets in 120 minutes (very low score)
      const resetIn120Min = new Date(now.getTime() + 120 * 60 * 1000);
      manager.updateTokenStatus('token2', {
        remaining: 0,
        limit: 5000,
        resetTime: resetIn120Min,
      });
      
      const bestToken = manager.findBestAvailableToken();
      // Token 1 should be selected (score 50) over Token 2 (score ~5000/120 = 41)
      expect(bestToken).toBe('token1');
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