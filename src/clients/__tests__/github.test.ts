import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createGitHubClient } from '../github';
import { createMockGitHubClient } from '../../__tests__/utils/mocks';

// Mock the Octokit module
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => createMockGitHubClient()),
}));

describe('GitHub Client', () => {
  let client: any;
  let mockOctokit: any;

  beforeEach(() => {
    jest.clearAllMocks();
    client = createGitHubClient('test-token');
    // Get the mock instance that was created
    const { Octokit } = require('@octokit/rest');
    mockOctokit = Octokit.mock.results[0].value;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status', async () => {
      const mockResponse = {
        data: {
          resources: {
            core: {
              limit: 5000,
              remaining: 4999,
              reset: 1640995200,
            },
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue(mockResponse);

      const result = await client.getRateLimitStatus();

      expect(result).toEqual({
        remaining: 4999,
        limit: 5000,
        resetTime: new Date(1640995200 * 1000),
        secondsUntilReset: expect.any(Number),
      });
    });
  });

  describe('checkRateLimits', () => {
    it('should not throw when rate limits are sufficient', async () => {
      const mockResponse = {
        data: {
          resources: {
            core: {
              limit: 5000,
              remaining: 100,
              reset: 1640995200,
            },
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue(mockResponse);

      await expect(client.checkRateLimits()).resolves.not.toThrow();
    });

    it('should throw when rate limits are exceeded', async () => {
      const mockResponse = {
        data: {
          resources: {
            core: {
              limit: 5000,
              remaining: 0,
              reset: 1640995200,
            },
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue(mockResponse);

      await expect(client.checkRateLimits()).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('makeRequestWithRetry', () => {
    it('should retry failed requests', async () => {
      const mockRequest = jest.fn<() => any>()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const result = await client.makeRequestWithRetry(mockRequest);

      expect(result).toBe('success');
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockRequest = jest.fn<() => any>().mockRejectedValue(new Error('Network error'));

      await expect(client.makeRequestWithRetry(mockRequest)).rejects.toThrow('Network error');
    });
  });

  describe('fetchOrganizationRepositories', () => {
    it('should fetch repositories for an organization', async () => {
      const mockRepos = [
        { id: 1, name: 'repo1', owner: { login: 'test-org' } },
        { id: 2, name: 'repo2', owner: { login: 'test-org' } },
      ];

      mockOctokit.rest.repos.listForOrg.mockResolvedValue({ data: mockRepos });

      const result = await client.fetchOrganizationRepositories('test-org');

      expect(result).toEqual(mockRepos);
      expect(mockOctokit.rest.repos.listForOrg).toHaveBeenCalledWith({
        org: 'test-org',
        per_page: 100,
        type: 'all',
      });
    });
  });

  describe('getPullRequests', () => {
    it('should fetch pull requests with default options', async () => {
      const mockPRs = [{ id: 1, number: 1, title: 'Test PR' }];
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });

      const result = await client.getPullRequests('owner', 'repo');

      expect(result).toEqual(mockPRs);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'all',
        per_page: 100,
        sort: 'created',
        direction: 'desc',
      });
    });

    it('should fetch pull requests with custom options', async () => {
      const mockPRs = [{ id: 1, number: 1, title: 'Test PR' }];
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });

      const result = await client.getPullRequests('owner', 'repo', {
        state: 'closed',
        per_page: 50,
      });

      expect(result).toEqual(mockPRs);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'closed',
        per_page: 50,
        sort: 'created',
        direction: 'desc',
      });
    });
  });

  describe('getPullRequest', () => {
    it('should fetch a specific pull request', async () => {
      const mockPR = { id: 1, number: 1, title: 'Test PR' };
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });

      const result = await client.getPullRequest('owner', 'repo', 1);

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
      });
    });
  });

  describe('getPullRequestReviews', () => {
    it('should fetch pull request reviews', async () => {
      const mockReviews = [{ id: 1, state: 'APPROVED' }];
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({ data: mockReviews });

      const result = await client.getPullRequestReviews('owner', 'repo', 1);

      expect(result).toEqual(mockReviews);
      expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        per_page: 100,
      });
    });
  });

  describe('getRepositoryCommits', () => {
    it('should fetch repository commits', async () => {
      const mockCommits = [{ sha: 'abc123', commit: { message: 'Test commit' } }];
      mockOctokit.rest.repos.listCommits.mockResolvedValue({ data: mockCommits });

      const result = await client.getRepositoryCommits('owner', 'repo');

      expect(result).toEqual(mockCommits);
      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 100,
      });
    });
  });

  describe('getWorkflowRuns', () => {
    it('should fetch workflow runs', async () => {
      const mockRuns = [{ id: 1, name: 'Test Workflow' }];
      mockOctokit.request.mockResolvedValue({ data: mockRuns });

      const result = await client.getWorkflowRuns('owner', 'repo', 'main');

      expect(result).toEqual(mockRuns);
      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/actions/runs',
        {
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
          per_page: 100,
        }
      );
    });
  });

  describe('getAuditLog', () => {
    it('should fetch audit log entries', async () => {
      const mockAuditLog = [
        { user: 'test-user', user_id: 123, created_at: '2024-01-01T00:00:00Z', org_id: 456 },
      ];
      mockOctokit.paginate.mockResolvedValue(mockAuditLog);

      const result = await client.getAuditLog('test-org');

      expect(result).toEqual(mockAuditLog);
      expect(mockOctokit.paginate).toHaveBeenCalledWith(
        'GET /orgs/{org}/audit-log',
        { org: 'test-org' }
      );
    });
  });

  describe('getRepositoryCommitsByPath', () => {
    it('should fetch repository commits by path', async () => {
      const mockCommits = [{ sha: 'abc123', commit: { message: 'Test commit' } }];
      mockOctokit.request.mockResolvedValue({ data: mockCommits });

      const result = await client.getRepositoryCommitsByPath('owner', 'repo', 'src/');

      expect(result).toEqual(mockCommits);
      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/commits',
        {
          owner: 'owner',
          repo: 'repo',
          path: 'src/',
          per_page: 100,
        }
      );
    });
  });

  describe('searchPullRequests', () => {
    it('should search pull requests', async () => {
      const mockPRs = {
        items: [
          {
            id: 1,
            number: 1,
            title: 'Test PR',
            created_at: '2024-01-01T00:00:00Z',
            closed_at: '2024-01-02T00:00:00Z',
            merged_at: '2024-01-02T00:00:00Z',
            user: { login: 'test-user' },
          },
        ],
      };
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({ data: mockPRs });

      const result = await client.searchPullRequests('test-org', 'test-repo');

      expect(result).toEqual(mockPRs.items);
      expect(mockOctokit.search.issuesAndPullRequests).toHaveBeenCalledWith({
        q: 'org:test-org repo:test-repo is:pr',
        sort: 'created',
        order: 'desc',
        per_page: 100,
      });
    });
  });
}); 