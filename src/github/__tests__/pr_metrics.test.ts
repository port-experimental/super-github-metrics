import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { calculateAndStorePRMetrics } from '../pr_metrics';
import { createMockGitHubClient, createMockPortClient } from '../../__tests__/utils/mocks';
import type { PullRequestBasic, PullRequest, PullRequestReview, Commit, Repository } from '../../types/github';

// Mock the clients
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  PortClient: {
    getInstance: jest.fn(),
  },
}));

describe('PR Metrics', () => {
  let mockGitHubClient: ReturnType<typeof createMockGitHubClient>;
  let mockPortClient: ReturnType<typeof createMockPortClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGitHubClient = createMockGitHubClient();
    mockPortClient = createMockPortClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('calculateAndStorePRMetrics', () => {
    const mockRepository: Repository = {
      id: 123456,
      name: 'test-repo',
      owner: {
        login: 'test-org',
      },
      default_branch: 'main',
    };

    const mockPullRequestBasic: PullRequestBasic = {
      id: 789,
      number: 1,
      created_at: '2024-01-01T10:00:00Z',
      closed_at: '2024-01-02T10:00:00Z',
      merged_at: '2024-01-02T10:00:00Z',
      user: { login: 'test-user' },
    };

    const mockPullRequest: PullRequest = {
      ...mockPullRequestBasic,
      additions: 100,
      deletions: 50,
      changed_files: 5,
      comments: 3,
      review_comments: 2,
    };

    const mockReview: PullRequestReview = {
      id: 456,
      state: 'APPROVED',
      submitted_at: '2024-01-01T15:00:00Z',
      user: { login: 'reviewer' },
    };

    const mockCommit: Commit = {
      commit: {
        author: {
          date: '2024-01-01T12:00:00Z',
        },
      },
      author: { login: 'test-user' },
      stats: { total: 150 },
    };

    it('should calculate PR metrics successfully', async () => {
      // Setup mocks
      mockGitHubClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockReview]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([mockCommit]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      // Verify GitHub client calls
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-org', 'test-repo', {
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
      });

      expect(mockGitHubClient.getPullRequest).toHaveBeenCalledWith('test-org', 'test-repo', 1);
      expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalledWith('test-org', 'test-repo', 1);
      expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalledWith('test-org', 'test-repo', 1);
    });

    it('should handle empty PR list', async () => {
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequest).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestReviews).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommits).not.toHaveBeenCalled();
    });

    it('should handle PRs without merge date', async () => {
      const unmergedPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        merged_at: null,
      };

      mockGitHubClient.getPullRequests.mockResolvedValue([unmergedPR]);
      mockGitHubClient.getPullRequest.mockResolvedValue({
        ...mockPullRequest,
        merged_at: null,
      });
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      expect(mockGitHubClient.getPullRequest).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.getPullRequests.mockRejectedValue(new Error('API Error'));
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await expect(calculateAndStorePRMetrics(repos, authToken)).rejects.toThrow('API Error');
    });

    it('should calculate correct metrics for PR with all data', async () => {
      const testPR: PullRequest = {
        id: 123,
        number: 1,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'test-user' },
        additions: 100,
        deletions: 50,
        changed_files: 5,
        comments: 3,
        review_comments: 2,
      };

      const testReviews: PullRequestReview[] = [
        {
          id: 456,
          state: 'APPROVED',
          submitted_at: '2024-01-01T15:00:00Z',
          user: { login: 'reviewer1' },
        },
        {
          id: 457,
          state: 'CHANGES_REQUESTED',
          submitted_at: '2024-01-01T16:00:00Z',
          user: { login: 'reviewer2' },
        },
      ];

      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: '2024-01-01T12:00:00Z',
            },
          },
          author: { login: 'test-user' },
          stats: { total: 150 },
        },
        {
          commit: {
            author: {
              date: '2024-01-01T13:00:00Z',
            },
          },
          author: { login: 'test-user' },
          stats: { total: 75 },
        },
      ];

      mockGitHubClient.getPullRequests.mockResolvedValue([testPR]);
      mockGitHubClient.getPullRequest.mockResolvedValue(testPR);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue(testReviews);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue(testCommits);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      // Verify that upsertProps was called with the correct metrics
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'test-user',
        expect.objectContaining({
          pr_count: 1,
          pr_size: 150, // additions + deletions
          pr_lifetime: expect.any(Number), // should be 24 hours in milliseconds
          pr_pickup_time: expect.any(Number), // time from creation to first review
          pr_review_participation: 2, // number of reviews
          pr_commit_count: 2, // number of commits
        })
      );
    });

    it('should handle PRs with missing optional fields', async () => {
      const minimalPR: PullRequest = {
        id: 123,
        number: 1,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'test-user' },
        additions: 0,
        deletions: 0,
        changed_files: 0,
        comments: 0,
        review_comments: 0,
      };

      mockGitHubClient.getPullRequests.mockResolvedValue([minimalPR]);
      mockGitHubClient.getPullRequest.mockResolvedValue(minimalPR);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'test-user',
        expect.objectContaining({
          pr_count: 1,
          pr_size: 0,
          pr_lifetime: expect.any(Number),
          pr_pickup_time: 0, // no reviews
          pr_review_participation: 0,
          pr_commit_count: 0,
        })
      );
    });
  });
}); 