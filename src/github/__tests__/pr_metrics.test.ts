import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { calculateAndStorePRMetrics } from '../pr_metrics';
import {
  createMockGitHubClient,
  createMockPortClient,
  mockRepository,
  mockPullRequestBasic,
  mockPullRequest,
  mockCommit,
} from '../../__tests__/utils/mocks';
import type { PullRequest, PullRequestReview, Commit, PullRequestBasic } from '../../types/github';

// Mock the GitHub client
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

// Mock the Port client
jest.mock('../../clients/port', () => ({
  upsertProps: jest.fn(),
}));

describe('PR Metrics', () => {
  let mockGitHubClient: any;
  let mockPortClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock clients
    mockGitHubClient = createMockGitHubClient();
    mockPortClient = createMockPortClient();

    // Setup the mocks
    const { createGitHubClient } = require('../../clients/github');
    const { upsertProps } = require('../../clients/port');

    createGitHubClient.mockReturnValue(mockGitHubClient);
    upsertProps.mockResolvedValue(undefined);
  });

  describe('calculateAndStorePRMetrics', () => {
    it('should calculate PR metrics successfully', async () => {
      // Create mock data with recent dates
      const now = new Date();
      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        closed_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
        merged_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests.mockResolvedValueOnce([recentPR]).mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([mockCommit]);

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      // Verify GitHub client calls
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-owner', 'test-repo', {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: 1,
      });

      expect(mockGitHubClient.getPullRequest).toHaveBeenCalledWith('test-owner', 'test-repo', 1);
      expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        1
      );
      expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        1
      );
    });

    it('should handle empty PR list', async () => {
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequest).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestReviews).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommits).not.toHaveBeenCalled();
    });

    it('should handle PRs without merge date', async () => {
      const now = new Date();
      const unmergedPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        closed_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
        merged_at: null,
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([unmergedPR])
        .mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue({
        ...mockPullRequest,
        merged_at: null,
      });
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      expect(mockGitHubClient.getPullRequest).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      // Mock the getPullRequests method to throw an error
      mockGitHubClient.getPullRequests.mockRejectedValue(new Error('API Error'));

      const repos = [mockRepository];
      const authToken = 'test-token';

      // The function should throw an error when all repositories fail
      await expect(calculateAndStorePRMetrics(repos, authToken)).rejects.toThrow(
        'Failed to process any repositories. Failed repos: test-repo'
      );
    });

    it('should calculate correct metrics for PR with all data', async () => {
      const now = new Date();
      const testPR: PullRequest = {
        id: 123,
        number: 1,
        created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        closed_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
        merged_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
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
          submitted_at: new Date(now.getTime() - 29.5 * 24 * 60 * 60 * 1000).toISOString(), // 29.5 days ago
          user: { login: 'reviewer1' },
        },
        {
          id: 457,
          state: 'CHANGES_REQUESTED',
          submitted_at: new Date(now.getTime() - 29.4 * 24 * 60 * 60 * 1000).toISOString(), // 29.4 days ago
          user: { login: 'reviewer2' },
        },
      ];

      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: new Date(now.getTime() - 29.8 * 24 * 60 * 60 * 1000).toISOString(), // 29.8 days ago
            },
          },
          stats: { total: 10 },
        },
        {
          commit: {
            author: {
              date: new Date(now.getTime() - 29.7 * 24 * 60 * 60 * 1000).toISOString(), // 29.7 days ago
            },
          },
          stats: { total: 20 },
        },
      ];

      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: testPR.created_at,
        closed_at: testPR.closed_at,
        merged_at: testPR.merged_at,
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests.mockResolvedValueOnce([recentPR]).mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue(testPR);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue(testReviews);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue(testCommits);

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      // Verify that upsertProps was called with the correct metrics
      const { upsertProps } = require('../../clients/port');
      expect(upsertProps).toHaveBeenCalledWith(
        'githubPullRequest',
        'test-repo789',
        expect.objectContaining({
          pr_size: 150, // additions + deletions
          pr_lifetime: expect.any(Number), // should be 1 day in days
          pr_pickup_time: expect.any(Number), // time from creation to first review
          review_participation: 2, // number of reviews
          number_of_commits_after_pr_is_opened: 2, // number of commits
        })
      );
    });

    it('should handle PRs with missing optional fields', async () => {
      const now = new Date();
      const minimalPR: PullRequest = {
        id: 123,
        number: 1,
        created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        closed_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
        merged_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days ago
        user: { login: 'test-user' },
        additions: 0,
        deletions: 0,
        changed_files: 0,
        comments: 0,
        review_comments: 0,
      };

      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: minimalPR.created_at,
        closed_at: minimalPR.closed_at,
        merged_at: minimalPR.merged_at,
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests.mockResolvedValueOnce([recentPR]).mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue(minimalPR);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);

      const repos = [mockRepository];
      const authToken = 'test-token';

      await calculateAndStorePRMetrics(repos, authToken);

      const { upsertProps } = require('../../clients/port');
      expect(upsertProps).toHaveBeenCalledWith(
        'githubPullRequest',
        'test-repo789',
        expect.objectContaining({
          pr_size: 0,
          pr_lifetime: expect.any(Number),
          pr_pickup_time: null, // no reviews
          review_participation: 0,
          number_of_commits_after_pr_is_opened: 0,
        })
      );
    });
  });
});
