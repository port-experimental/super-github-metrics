import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createMockGitHubClient,
  createMockPortClient,
  mockPullRequestBasic,
  mockRepository,
} from '../../__tests__/utils/mocks';
import type { PullRequestBasic } from '../../clients/github/types';
import { calculateAndStorePRMetrics } from '../pr_metrics';

// Mock the GitHub client
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

// Mock the Port client
jest.mock('../../clients/port', () => ({
  upsertEntitiesInBatches: jest.fn(),
}));

describe('PR Metrics', () => {
  let mockGitHubClient: any;
  let _mockPortClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock clients
    mockGitHubClient = createMockGitHubClient();
    _mockPortClient = createMockPortClient();

    // Setup the mocks
    const { createGitHubClient } = require('../../clients/github');
    const { upsertEntitiesInBatches } = require('../../clients/port');

    createGitHubClient.mockReturnValue(mockGitHubClient);
    upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);
  });

  describe('calculateAndStorePRMetrics', () => {
    it('should calculate PR metrics successfully', async () => {
      const now = new Date();
      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(),
        closed_at: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(),
        merged_at: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(),
      };

      mockGitHubClient.getPullRequests.mockResolvedValueOnce([recentPR]).mockResolvedValueOnce([]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-owner', 'test-repo', {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: 1,
      });

      // New source uses batch GraphQL methods instead of individual calls
      expect(mockGitHubClient.getPullRequestFullDataBatch).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        [recentPR.number]
      );
      expect(mockGitHubClient.getPullRequestCommitsBatch).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        [recentPR.number]
      );
    });

    it('should handle empty PR list', async () => {
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
      // When no PRs, batch methods should not be called
      expect(mockGitHubClient.getPullRequestFullDataBatch).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommitsBatch).not.toHaveBeenCalled();

      const { upsertEntitiesInBatches } = require('../../clients/port');
      expect(upsertEntitiesInBatches).not.toHaveBeenCalled();
    });

    it('should handle PRs without merge date', async () => {
      const now = new Date();
      const unmergedPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(),
        closed_at: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(),
        merged_at: null,
      };

      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([unmergedPR])
        .mockResolvedValueOnce([]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getPullRequestFullDataBatch).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommitsBatch).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.getPullRequests.mockRejectedValue(new Error('API Error'));

      const repos = [mockRepository];

      // fetchRepositoryPRs catches errors internally and returns [],
      // so the outer function resolves successfully with no entities
      await expect(calculateAndStorePRMetrics(repos, mockGitHubClient)).resolves.toBeUndefined();
    });

    it('should calculate correct metrics for PR with all data', async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
      const closedAt = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const mergedAt = closedAt;
      const firstReviewAt = new Date(now.getTime() - 28.5 * 24 * 60 * 60 * 1000).toISOString();
      const secondReviewAt = new Date(now.getTime() - 28.4 * 24 * 60 * 60 * 1000).toISOString();
      const commitAt = new Date(now.getTime() - 28.8 * 24 * 60 * 60 * 1000).toISOString();

      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: createdAt,
        closed_at: closedAt,
        merged_at: mergedAt,
      };

      mockGitHubClient.getPullRequests.mockResolvedValueOnce([recentPR]).mockResolvedValueOnce([]);

      // Set up batch mock with full PR data including reviews
      const prFullDataMap = new Map([
        [
          mockPullRequestBasic.number,
          {
            number: mockPullRequestBasic.number,
            additions: 100,
            deletions: 50,
            changedFiles: 5,
            comments: 3,
            reviewThreads: 2,
            createdAt,
            mergedAt,
            closedAt,
            state: 'CLOSED',
            isDraft: false,
            reviews: [
              { state: 'APPROVED', submittedAt: firstReviewAt, author: { login: 'reviewer1' } },
              {
                state: 'CHANGES_REQUESTED',
                submittedAt: secondReviewAt,
                author: { login: 'reviewer2' },
              },
            ],
          },
        ],
      ]);

      const prCommitsMap = new Map([
        [
          mockPullRequestBasic.number,
          {
            number: mockPullRequestBasic.number,
            commits: [
              { committedDate: commitAt, additions: 10, deletions: 0 },
              {
                committedDate: new Date(now.getTime() - 28.7 * 24 * 60 * 60 * 1000).toISOString(),
                additions: 20,
                deletions: 0,
              },
            ],
          },
        ],
      ]);

      mockGitHubClient.getPullRequestFullDataBatch.mockResolvedValueOnce(prFullDataMap);
      mockGitHubClient.getPullRequestCommitsBatch.mockResolvedValueOnce(prCommitsMap);

      await calculateAndStorePRMetrics([mockRepository], mockGitHubClient);

      // Verify upsertEntitiesInBatches was called with correct aggregated metrics
      const { upsertEntitiesInBatches } = require('../../clients/port');
      expect(upsertEntitiesInBatches).toHaveBeenCalledWith(
        'githubPullRequest',
        expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              total_prs: 1,
              total_merged_prs: 1,
              number_of_prs_reviewed: 1,
              pr_success_rate: 100,
            }),
          }),
        ])
      );
    });

    it('should handle PRs with missing optional fields', async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
      const closedAt = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const mergedAt = closedAt;

      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: createdAt,
        closed_at: closedAt,
        merged_at: mergedAt,
      };

      mockGitHubClient.getPullRequests.mockResolvedValueOnce([recentPR]).mockResolvedValueOnce([]);

      // Set up batch mock with minimal PR data (no reviews, no commits)
      const prFullDataMap = new Map([
        [
          mockPullRequestBasic.number,
          {
            number: mockPullRequestBasic.number,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
            comments: 0,
            reviewThreads: 0,
            createdAt,
            mergedAt,
            closedAt,
            state: 'CLOSED',
            isDraft: false,
            reviews: [],
          },
        ],
      ]);

      const prCommitsMap = new Map([
        [mockPullRequestBasic.number, { number: mockPullRequestBasic.number, commits: [] }],
      ]);

      mockGitHubClient.getPullRequestFullDataBatch.mockResolvedValueOnce(prFullDataMap);
      mockGitHubClient.getPullRequestCommitsBatch.mockResolvedValueOnce(prCommitsMap);

      await calculateAndStorePRMetrics([mockRepository], mockGitHubClient);

      const { upsertEntitiesInBatches } = require('../../clients/port');
      expect(upsertEntitiesInBatches).toHaveBeenCalledWith(
        'githubPullRequest',
        expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              total_prs: 1,
              total_merged_prs: 1,
              number_of_prs_reviewed: 0, // no reviews
              pr_success_rate: 100,
            }),
          }),
        ])
      );
    });
  });
});
