import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GitHubClient } from '../github';
import { mockOctokit, mockAxios } from '../../__tests__/utils/mocks';

// Mock Octokit
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

// Mock axios
jest.mock('axios', () => mockAxios);

describe('GitHubClient', () => {
  let client: GitHubClient;
  const testToken = 'test-token';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new GitHubClient(testToken);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a GitHub client with the provided token', () => {
      expect(client).toBeInstanceOf(GitHubClient);
    });
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

      mockOctokit.rest.rateLimit.get = jest.fn().mockResolvedValue(mockResponse);

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

      mockOctokit.rest.rateLimit.get = jest.fn().mockResolvedValue(mockResponse);

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

      mockOctokit.rest.rateLimit.get = jest.fn().mockResolvedValue(mockResponse);

      await expect(client.checkRateLimits()).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('makeRequestWithRetry', () => {
    it('should retry failed requests', async () => {
      const mockRequest = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const result = await client.makeRequestWithRetry(mockRequest);

      expect(result).toBe('success');
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockRequest = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.makeRequestWithRetry(mockRequest, 2)).rejects.toThrow('Network error');
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchOrganizationRepositories', () => {
    it('should fetch repositories for an organization', async () => {
      const mockRepos = [
        { id: 1, name: 'repo1', owner: { login: 'org' } },
        { id: 2, name: 'repo2', owner: { login: 'org' } },
      ];

      mockOctokit.rest.repos.listForOrg = jest.fn().mockResolvedValue({ data: mockRepos });

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
      mockOctokit.rest.pulls.list = jest.fn().mockResolvedValue({ data: mockPRs });

      const result = await client.getPullRequests('owner', 'repo');

      expect(result).toEqual(mockPRs);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: 1,
      });
    });

    it('should fetch pull requests with custom options', async () => {
      const mockPRs = [{ id: 1, number: 1, title: 'Test PR' }];
      mockOctokit.rest.pulls.list = jest.fn().mockResolvedValue({ data: mockPRs });

      const result = await client.getPullRequests('owner', 'repo', {
        state: 'open',
        sort: 'updated',
        direction: 'asc',
        per_page: 50,
        page: 2,
      });

      expect(result).toEqual(mockPRs);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'open',
        sort: 'updated',
        direction: 'asc',
        per_page: 50,
        page: 2,
      });
    });
  });

  describe('getPullRequest', () => {
    it('should fetch a specific pull request', async () => {
      const mockPR = { id: 1, number: 1, title: 'Test PR' };
      mockOctokit.rest.pulls.get = jest.fn().mockResolvedValue({ data: mockPR });

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
    it('should fetch reviews for a pull request', async () => {
      const mockReviews = [{ id: 1, state: 'APPROVED' }];
      mockOctokit.rest.pulls.listReviews = jest.fn().mockResolvedValue({ data: mockReviews });

      const result = await client.getPullRequestReviews('owner', 'repo', 1);

      expect(result).toEqual(mockReviews);
      expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
      });
    });
  });

  describe('getRepositoryCommits', () => {
    it('should fetch commits for a repository', async () => {
      const mockCommits = [{ sha: 'abc123', commit: { message: 'Test commit' } }];
      mockOctokit.rest.repos.listCommits = jest.fn().mockResolvedValue({ data: mockCommits });

      const result = await client.getRepositoryCommits('owner', 'repo');

      expect(result).toEqual(mockCommits);
      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 100,
        page: 1,
      });
    });
  });

  describe('getWorkflowRuns', () => {
    it('should fetch workflow runs for a repository', async () => {
      const mockRuns = { workflow_runs: [{ id: 1, name: 'test-workflow' }] };
      mockOctokit.request = jest.fn().mockResolvedValue({ data: mockRuns });

      const result = await client.getWorkflowRuns('owner', 'repo');

      expect(result).toEqual(mockRuns.workflow_runs);
      expect(mockOctokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/actions/runs', {
        owner: 'owner',
        repo: 'repo',
        branch: undefined,
        exclude_pull_requests: true,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    });
  });

  describe('getMemberAddDates', () => {
    it('should fetch member add dates from audit log', async () => {
      const mockAuditLog = [
        { user: 'user1', user_id: 1, created_at: '2024-01-01T00:00:00Z', org_id: 177709801 },
      ];
      mockOctokit.paginate = jest.fn().mockResolvedValue(mockAuditLog);

      const result = await client.getMemberAddDates('test-enterprise');

      expect(result).toEqual(mockAuditLog);
      expect(mockOctokit.paginate).toHaveBeenCalledWith('GET /enterprises/{enterprise}/audit-log', {
        enterprise: 'test-enterprise',
        phrase: 'action:org.add_member',
        include: 'web',
        per_page: 100,
        order: 'desc',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    });
  });

  describe('searchCommits', () => {
    it('should search for commits by author and organization', async () => {
      const mockCommits = { items: [{ sha: 'abc123', commit: { message: 'Test' } }] };
      mockOctokit.request = jest.fn().mockResolvedValue({ data: mockCommits });

      const result = await client.searchCommits('test-user', 'test-org');

      expect(result).toEqual(mockCommits.items);
      expect(mockOctokit.request).toHaveBeenCalledWith('GET /search/commits ', {
        q: 'author:test-user org:test-org sort:committer-date-asc',
        advanced_search: true,
        per_page: 10,
        page: 1,
        headers: {
          'If-None-Match': '',
          Accept: 'application/vnd.github.v3+json',
        },
      });
    });
  });

  describe('searchPullRequests', () => {
    it('should search for pull requests by author and organization', async () => {
      const mockPRs = { items: [{ id: 1, number: 1, title: 'Test PR' }] };
      mockOctokit.search.issuesAndPullRequests = jest.fn().mockResolvedValue({ data: mockPRs });

      const result = await client.searchPullRequests('test-user', 'test-org');

      expect(result).toEqual(mockPRs.items.map(pr => ({
        id: pr.id,
        number: pr.number,
        created_at: pr.created_at,
        closed_at: pr.closed_at,
        merged_at: pr.merged_at,
        user: pr.user,
      })));
    });
  });
}); 