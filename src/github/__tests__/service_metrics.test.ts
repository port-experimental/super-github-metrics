import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { calculateAndStoreServiceMetrics } from '../service_metrics';
import { createMockGitHubClient, createMockPortClient } from '../../__tests__/utils/mocks';
import type { Repository, Commit, PullRequestBasic, PullRequest, PullRequestReview } from '../../types/github';

// Mock the clients
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  PortClient: {
    getInstance: jest.fn(),
  },
}));

describe('Service Metrics', () => {
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

  describe('calculateAndStoreServiceMetrics', () => {
    const mockRepository: Repository = {
      id: 123456,
      name: 'test-repo',
      owner: {
        login: 'test-org',
      },
      default_branch: 'main',
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

    it('should calculate service metrics successfully', async () => {
      // Setup mocks
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([mockCommit]);
      mockGitHubClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockReview]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      // Verify GitHub client calls
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledWith('test-org', 'test-repo');
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-org', 'test-repo', {
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
      });
    });

    it('should handle empty repository list', async () => {
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos: Repository[] = [];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      expect(mockGitHubClient.getRepositoryCommits).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).not.toHaveBeenCalled();
    });

    it('should handle repositories without commits', async () => {
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.getRepositoryCommits.mockRejectedValue(new Error('API Error'));
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await expect(calculateAndStoreServiceMetrics(repos, authToken)).rejects.toThrow('API Error');
    });

    it('should calculate correct commit metrics', async () => {
      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: '2024-01-01T12:00:00Z',
            },
          },
          author: { login: 'user1' },
          stats: { total: 100 },
        },
        {
          commit: {
            author: {
              date: '2024-01-01T13:00:00Z',
            },
          },
          author: { login: 'user2' },
          stats: { total: 200 },
        },
        {
          commit: {
            author: {
              date: '2024-01-01T14:00:00Z',
            },
          },
          author: { login: 'user1' },
          stats: { total: 150 },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockResolvedValue(testCommits);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      // Should be called for each user
      expect(upsertPropsMock).toHaveBeenCalledTimes(2);
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user1',
        expect.objectContaining({
          commit_count: 2,
          commit_size: 250, // 100 + 150
        })
      );
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user2',
        expect.objectContaining({
          commit_count: 1,
          commit_size: 200,
        })
      );
    });

    it('should calculate correct PR metrics', async () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T10:00:00Z',
          closed_at: '2024-01-02T10:00:00Z',
          merged_at: '2024-01-02T10:00:00Z',
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: '2024-01-01T11:00:00Z',
          closed_at: '2024-01-02T11:00:00Z',
          merged_at: '2024-01-02T11:00:00Z',
          user: { login: 'user2' },
        },
      ];

      const testPRDetails: PullRequest[] = [
        {
          ...testPRs[0],
          additions: 100,
          deletions: 50,
          changed_files: 5,
          comments: 3,
          review_comments: 2,
        },
        {
          ...testPRs[1],
          additions: 200,
          deletions: 100,
          changed_files: 10,
          comments: 5,
          review_comments: 3,
        },
      ];

      const testReviews: PullRequestReview[] = [
        {
          id: 1,
          state: 'APPROVED',
          submitted_at: '2024-01-01T15:00:00Z',
          user: { login: 'reviewer1' },
        },
        {
          id: 2,
          state: 'CHANGES_REQUESTED',
          submitted_at: '2024-01-01T16:00:00Z',
          user: { login: 'reviewer2' },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue(testPRs);
      mockGitHubClient.getPullRequest
        .mockResolvedValueOnce(testPRDetails[0])
        .mockResolvedValueOnce(testPRDetails[1]);
      mockGitHubClient.getPullRequestReviews
        .mockResolvedValueOnce([testReviews[0]])
        .mockResolvedValueOnce([testReviews[0], testReviews[1]]);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      // Should be called for each user
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user1',
        expect.objectContaining({
          pr_count: 1,
          pr_size: 150, // additions + deletions
          pr_lifetime: expect.any(Number),
          pr_pickup_time: expect.any(Number),
          pr_review_participation: 1,
        })
      );
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user2',
        expect.objectContaining({
          pr_count: 1,
          pr_size: 300, // additions + deletions
          pr_lifetime: expect.any(Number),
          pr_pickup_time: expect.any(Number),
          pr_review_participation: 2,
        })
      );
    });

    it('should handle commits without author information', async () => {
      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: '2024-01-01T12:00:00Z',
            },
          },
          author: null, // No author information
          stats: { total: 100 },
        },
        {
          commit: {
            author: {
              date: '2024-01-01T13:00:00Z',
            },
          },
          author: { login: 'user1' },
          stats: { total: 200 },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockResolvedValue(testCommits);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      // Should only process commits with author information
      expect(upsertPropsMock).toHaveBeenCalledTimes(1);
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user1',
        expect.objectContaining({
          commit_count: 1,
          commit_size: 200,
        })
      );
    });

    it('should handle PRs without merge date', async () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T10:00:00Z',
          closed_at: '2024-01-02T10:00:00Z',
          merged_at: null, // Not merged
          user: { login: 'user1' },
        },
      ];

      const testPRDetails: PullRequest = {
        ...testPRs[0],
        additions: 100,
        deletions: 50,
        changed_files: 5,
        comments: 3,
        review_comments: 2,
      };

      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue(testPRs);
      mockGitHubClient.getPullRequest.mockResolvedValue(testPRDetails);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      // Should still process the PR but with different lifetime calculation
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user1',
        expect.objectContaining({
          pr_count: 1,
          pr_size: 150,
          pr_lifetime: expect.any(Number), // Should use closed_at instead of merged_at
          pr_pickup_time: 0, // No reviews
          pr_review_participation: 0,
        })
      );
    });

    it('should handle multiple repositories', async () => {
      const repo1: Repository = {
        id: 123456,
        name: 'repo1',
        owner: { login: 'test-org' },
        default_branch: 'main',
      };

      const repo2: Repository = {
        id: 789012,
        name: 'repo2',
        owner: { login: 'test-org' },
        default_branch: 'main',
      };

      const commits1: Commit[] = [
        {
          commit: {
            author: {
              date: '2024-01-01T12:00:00Z',
            },
          },
          author: { login: 'user1' },
          stats: { total: 100 },
        },
      ];

      const commits2: Commit[] = [
        {
          commit: {
            author: {
              date: '2024-01-01T13:00:00Z',
            },
          },
          author: { login: 'user2' },
          stats: { total: 200 },
        },
      ];

      mockGitHubClient.getRepositoryCommits
        .mockResolvedValueOnce(commits1)
        .mockResolvedValueOnce(commits2);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const repos = [repo1, repo2];
      const authToken = 'test-token';

      await calculateAndStoreServiceMetrics(repos, authToken);

      // Should aggregate metrics across repositories
      expect(upsertPropsMock).toHaveBeenCalledTimes(2);
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user1',
        expect.objectContaining({
          commit_count: 1,
          commit_size: 100,
        })
      );
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_user',
        'user2',
        expect.objectContaining({
          commit_count: 1,
          commit_size: 200,
        })
      );
    });
  });
}); 