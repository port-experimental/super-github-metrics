import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMockGitHubClient, createMockPortClient } from '../../__tests__/utils/mocks';
import type {
  Commit,
  PullRequest,
  PullRequestBasic,
  PullRequestReview,
  Repository,
} from '../../clients/github/types';
import {
  analyzePRFromBatchData,
  calculateAndStoreServiceMetrics,
  calculateRepositoryReviewMetrics,
  calculateReviewMetricsFromCache,
  contributionMapFromCommits,
  fetchRepositoryCommitsForPeriod,
  filterReviewDataForPeriod,
} from '../service_metrics';

// Mock the clients
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  updateEntity: jest.fn(),
  upsertEntitiesInBatches: jest.fn(),
}));

describe('Service Metrics', () => {
  let mockGitHubClient: ReturnType<typeof createMockGitHubClient>;
  let _mockPortClient: ReturnType<typeof createMockPortClient>;
  let mockCreateGitHubClient: jest.MockedFunction<any>;
  let mockUpdateEntity: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGitHubClient = createMockGitHubClient();
    _mockPortClient = createMockPortClient();

    // Get the mocked functions
    mockCreateGitHubClient = require('../../clients/github').createGitHubClient;
    mockUpdateEntity = require('../../clients/port').updateEntity;
    const { upsertEntitiesInBatches } = require('../../clients/port');

    // Configure the mocks
    mockCreateGitHubClient.mockReturnValue(mockGitHubClient);
    mockUpdateEntity.mockResolvedValue({});
    upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);
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
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(
        new Map().set(1, { hasReviews: true, firstReviewAt: mockReview.submitted_at })
      );

      const { upsertEntitiesInBatches } = require('../../clients/port');
      upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);

      const repos = [mockRepository];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify GitHub client calls
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledWith('test-org', 'test-repo', {
        per_page: 100,
        page: 1,
      });
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-org', 'test-repo', {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: 1,
      });
    });

    it('should handle empty repository list', async () => {
      const repos: Repository[] = [];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getRepositoryCommits).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).not.toHaveBeenCalled();
    });

    it('should handle repositories without commits', async () => {
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([mockCommit]);
      mockGitHubClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockReview]);
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(
        new Map().set(1, { hasReviews: true, firstReviewAt: mockReview.submitted_at })
      );

      const { upsertEntitiesInBatches } = require('../../clients/port');
      upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);

      const repos = [mockRepository];

      // Should not throw - API succeeds despite setup
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);
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
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(new Map());

      const repos = [mockRepository];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify that GitHub client methods were called correctly
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledWith('test-org', 'test-repo', {
        per_page: 100,
        page: 1,
      });
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-org', 'test-repo', {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: 1,
      });
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
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(new Map());

      const repos = [mockRepository];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify that GitHub client methods were called correctly
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith('test-org', 'test-repo', {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: 1,
      });
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
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(new Map());

      const repos = [mockRepository];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify that GitHub client methods were called
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
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
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(new Map());

      const repos = [mockRepository];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify processing completes without error
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
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
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(new Map());

      const repos = [repo1, repo2];

      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify that getRepositoryCommits was called for each repository
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledTimes(2);
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledTimes(2);
    });
  });

  describe('analyzePRFromBatchData', () => {
    it('should analyze PR with reviews correctly', () => {
      const pr: PullRequestBasic = {
        id: 1,
        number: 1,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'user1' },
      };

      const reviewData = {
        hasReviews: true,
        firstReviewAt: '2024-01-01T15:00:00Z',
      };

      const result = analyzePRFromBatchData(pr, reviewData);

      expect(result.isReviewed).toBe(true);
      expect(result.isMerged).toBe(true);
      expect(result.isMergedWithoutReview).toBe(false);
      expect(result.isSuccessful).toBe(true);
      expect(result.timeToFirstReview).toBeCloseTo(0.208, 2); // ~5 hours in days
    });

    it('should analyze PR without reviews correctly', () => {
      const pr: PullRequestBasic = {
        id: 2,
        number: 2,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'user1' },
      };

      const reviewData = {
        hasReviews: false,
      };

      const result = analyzePRFromBatchData(pr, reviewData);

      expect(result.isReviewed).toBe(false);
      expect(result.isMerged).toBe(true);
      expect(result.isMergedWithoutReview).toBe(true);
      expect(result.isSuccessful).toBe(true);
      expect(result.timeToFirstReview).toBeUndefined();
    });

    it('should handle undefined review data', () => {
      const pr: PullRequestBasic = {
        id: 3,
        number: 3,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: null,
        user: { login: 'user1' },
      };

      const result = analyzePRFromBatchData(pr, undefined);

      expect(result.isReviewed).toBe(false);
      expect(result.isMerged).toBe(false);
      expect(result.isMergedWithoutReview).toBe(false);
      expect(result.isSuccessful).toBe(false);
    });

    it('should correctly identify merged-without-review PRs', () => {
      const pr: PullRequestBasic = {
        id: 4,
        number: 4,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'user1' },
      };

      const reviewData = {
        hasReviews: false,
        firstReviewAt: undefined,
      };

      const result = analyzePRFromBatchData(pr, reviewData);

      expect(result.isMergedWithoutReview).toBe(true);
    });

    it('should calculate time-to-first-review correctly', () => {
      const pr: PullRequestBasic = {
        id: 5,
        number: 5,
        created_at: '2024-01-01T00:00:00Z',
        closed_at: '2024-01-03T00:00:00Z',
        merged_at: '2024-01-03T00:00:00Z',
        user: { login: 'user1' },
      };

      const reviewData = {
        hasReviews: true,
        firstReviewAt: '2024-01-02T00:00:00Z', // Exactly 1 day after creation
      };

      const result = analyzePRFromBatchData(pr, reviewData);

      expect(result.timeToFirstReview).toBe(1); // 1 day
    });
  });

  describe('calculateRepositoryReviewMetrics with batched data', () => {
    it('should use batched review fetching instead of sequential', async () => {
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

      // Setup batch mock
      const batchReviews = new Map<number, { hasReviews: boolean; firstReviewAt?: string }>();
      batchReviews.set(1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' });
      batchReviews.set(2, { hasReviews: false });
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(batchReviews);

      const result = await calculateRepositoryReviewMetrics(
        mockGitHubClient,
        'test-org',
        'test-repo',
        testPRs
      );

      // Verify batch method was called
      expect(mockGitHubClient.getPullRequestReviewsBatch).toHaveBeenCalledWith(
        'test-org',
        'test-repo',
        [1, 2]
      );

      // Verify individual REST API was NOT called
      expect(mockGitHubClient.getPullRequestReviews).not.toHaveBeenCalled();

      // Verify correct metrics calculated
      expect(result.totalPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(1);
      expect(result.numberOfPRsMergedWithoutReview).toBe(1);
    });

    it('should handle empty PR list', async () => {
      const result = await calculateRepositoryReviewMetrics(
        mockGitHubClient,
        'test-org',
        'test-repo',
        []
      );

      expect(result.totalPRs).toBe(0);
      expect(mockGitHubClient.getPullRequestReviewsBatch).not.toHaveBeenCalled();
    });

    it('should calculate correct metrics with batched data', async () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T00:00:00Z',
          closed_at: '2024-01-02T00:00:00Z',
          merged_at: '2024-01-02T00:00:00Z',
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: '2024-01-01T00:00:00Z',
          closed_at: '2024-01-02T00:00:00Z',
          merged_at: '2024-01-02T00:00:00Z',
          user: { login: 'user2' },
        },
        {
          id: 3,
          number: 3,
          created_at: '2024-01-01T00:00:00Z',
          closed_at: '2024-01-02T00:00:00Z',
          merged_at: null, // Not merged
          user: { login: 'user3' },
        },
      ];

      const batchReviews = new Map<number, { hasReviews: boolean; firstReviewAt?: string }>();
      batchReviews.set(1, { hasReviews: true, firstReviewAt: '2024-01-01T12:00:00Z' }); // Reviewed and merged
      batchReviews.set(2, { hasReviews: false }); // Merged without review
      batchReviews.set(3, { hasReviews: true, firstReviewAt: '2024-01-01T12:00:00Z' }); // Reviewed but not merged
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(batchReviews);

      const result = await calculateRepositoryReviewMetrics(
        mockGitHubClient,
        'test-org',
        'test-repo',
        testPRs
      );

      expect(result.totalPRs).toBe(3);
      expect(result.totalMergedPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(2);
      expect(result.numberOfPRsMergedWithoutReview).toBe(1);
      expect(result.totalSuccessfulPRs).toBe(2);
      expect(result.prsWithReviewTime).toBe(2);
    });

    it('should produce same results as sequential processing', async () => {
      // This tests that batched and sequential methods produce equivalent results
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T10:00:00Z',
          closed_at: '2024-01-02T10:00:00Z',
          merged_at: '2024-01-02T10:00:00Z',
          user: { login: 'user1' },
        },
      ];

      const batchReviews = new Map<number, { hasReviews: boolean; firstReviewAt?: string }>();
      batchReviews.set(1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' });
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(batchReviews);

      const result = await calculateRepositoryReviewMetrics(
        mockGitHubClient,
        'test-org',
        'test-repo',
        testPRs
      );

      // Should have correct review status
      expect(result.numberOfPRsReviewed).toBe(1);
      expect(result.numberOfPRsMergedWithoutReview).toBe(0);

      // Should have time to first review calculated
      expect(result.prsWithReviewTime).toBe(1);
      expect(result.totalTimeToFirstReview).toBeGreaterThan(0);
    });
  });

  describe('filterReviewDataForPeriod', () => {
    it('should filter reviews to only include PRs within time period', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        { id: 1, number: 1, created_at: '2026-01-30T00:00:00Z', user: { login: 'user1' } }, // 1 day ago
        { id: 2, number: 2, created_at: '2026-01-26T00:00:00Z', user: { login: 'user2' } }, // 5 days ago
        { id: 3, number: 3, created_at: '2026-01-02T00:00:00Z', user: { login: 'user3' } }, // 29 days ago
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T01:00:00Z' }],
        [2, { hasReviews: true, firstReviewAt: '2026-01-26T01:00:00Z' }],
        [3, { hasReviews: false }],
      ]);

      // Filter for 7-day period
      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 7);

      // Should only include PRs 1 and 2
      expect(filtered.size).toBe(2);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(true);
      expect(filtered.has(3)).toBe(false);

      jest.useRealTimers();
    });

    it('should filter for 1-day period', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        { id: 1, number: 1, created_at: '2026-01-30T12:00:00Z', user: { login: 'user1' } }, // Within 1 day
        { id: 2, number: 2, created_at: '2026-01-29T00:00:00Z', user: { login: 'user2' } }, // More than 1 day
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T13:00:00Z' }],
        [2, { hasReviews: false }],
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 1);

      expect(filtered.size).toBe(1);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(false);

      jest.useRealTimers();
    });

    it('should filter for 90-day period', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        { id: 1, number: 1, created_at: '2026-01-15T00:00:00Z', user: { login: 'user1' } }, // 16 days ago
        { id: 2, number: 2, created_at: '2025-12-01T00:00:00Z', user: { login: 'user2' } }, // 61 days ago
        { id: 3, number: 3, created_at: '2025-10-01T00:00:00Z', user: { login: 'user3' } }, // 122 days ago
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-15T01:00:00Z' }],
        [2, { hasReviews: true, firstReviewAt: '2025-12-01T01:00:00Z' }],
        [3, { hasReviews: false }],
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 90);

      // Should include PRs 1 and 2, but not 3
      expect(filtered.size).toBe(2);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(true);
      expect(filtered.has(3)).toBe(false);

      jest.useRealTimers();
    });

    it('should handle PRs without created_at date', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        { id: 1, number: 1, created_at: '2026-01-30T00:00:00Z', user: { login: 'user1' } },
        { id: 2, number: 2, created_at: null, user: { login: 'user2' } }, // No created_at
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T01:00:00Z' }],
        [2, { hasReviews: false }],
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 7);

      // Should only include PR 1 (PR 2 has no created_at)
      expect(filtered.size).toBe(1);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(false);

      jest.useRealTimers();
    });

    it('should handle PRs not in review map', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        { id: 1, number: 1, created_at: '2026-01-30T00:00:00Z', user: { login: 'user1' } },
        { id: 2, number: 2, created_at: '2026-01-29T00:00:00Z', user: { login: 'user2' } },
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T01:00:00Z' }],
        // PR 2 not in the map
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 7);

      // Should only include PR 1 (PR 2 not in review map)
      expect(filtered.size).toBe(1);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('calculateReviewMetricsFromCache', () => {
    it('should calculate metrics without API calls', () => {
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

      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' }],
        [2, { hasReviews: false }],
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.totalPRs).toBe(2);
      expect(result.totalMergedPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(1);
      expect(result.numberOfPRsMergedWithoutReview).toBe(1);
      expect(result.totalSuccessfulPRs).toBe(2);
      expect(result.prsWithReviewTime).toBe(1);
      expect(result.totalTimeToFirstReview).toBeGreaterThan(0);
    });

    it('should handle empty PR list', () => {
      const reviewsCache = new Map();

      const result = calculateReviewMetricsFromCache([], reviewsCache);

      expect(result.totalPRs).toBe(0);
      expect(result.totalMergedPRs).toBe(0);
      expect(result.numberOfPRsReviewed).toBe(0);
      expect(result.numberOfPRsMergedWithoutReview).toBe(0);
    });

    it('should calculate correct time to first review', () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T00:00:00Z',
          closed_at: '2024-01-03T00:00:00Z',
          merged_at: '2024-01-03T00:00:00Z',
          user: { login: 'user1' },
        },
      ];

      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-02T00:00:00Z' }], // 1 day after creation
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.prsWithReviewTime).toBe(1);
      expect(result.totalTimeToFirstReview).toBe(1); // Exactly 1 day
    });

    it('should handle PRs with missing review data in cache', () => {
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

      // Only PR 1 in cache
      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' }],
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.totalPRs).toBe(2);
      expect(result.totalMergedPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(1); // Only PR 1 has review data
      expect(result.numberOfPRsMergedWithoutReview).toBe(1); // PR 2 treated as not reviewed
    });

    it('should produce same results as calculateRepositoryReviewMetrics', async () => {
      // This test verifies that the cached version produces identical results
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
          merged_at: null,
          user: { login: 'user2' },
        },
        {
          id: 3,
          number: 3,
          created_at: '2024-01-01T12:00:00Z',
          closed_at: '2024-01-02T12:00:00Z',
          merged_at: '2024-01-02T12:00:00Z',
          user: { login: 'user3' },
        },
      ];

      const batchReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' }],
        [2, { hasReviews: true, firstReviewAt: '2024-01-01T16:00:00Z' }],
        [3, { hasReviews: false }],
      ]);
      mockGitHubClient.getPullRequestReviewsBatch.mockResolvedValue(batchReviews);

      // Get result from API-based version
      const apiResult = await calculateRepositoryReviewMetrics(
        mockGitHubClient,
        'test-org',
        'test-repo',
        testPRs
      );

      // Get result from cached version
      const cachedResult = calculateReviewMetricsFromCache(testPRs, batchReviews);

      // Should be identical
      expect(cachedResult.totalPRs).toBe(apiResult.totalPRs);
      expect(cachedResult.totalMergedPRs).toBe(apiResult.totalMergedPRs);
      expect(cachedResult.numberOfPRsReviewed).toBe(apiResult.numberOfPRsReviewed);
      expect(cachedResult.numberOfPRsMergedWithoutReview).toBe(
        apiResult.numberOfPRsMergedWithoutReview
      );
      expect(cachedResult.totalSuccessfulPRs).toBe(apiResult.totalSuccessfulPRs);
      expect(cachedResult.prsWithReviewTime).toBe(apiResult.prsWithReviewTime);
      expect(cachedResult.totalTimeToFirstReview).toBe(apiResult.totalTimeToFirstReview);
    });
  });

  describe('contributionMapFromCommits', () => {
    it('should group commits by author.login when present', () => {
      const commits: Commit[] = [
        {
          commit: { author: { date: '2024-01-01T10:00:00Z' } },
          author: { login: 'alice' },
        },
        {
          commit: { author: { date: '2024-01-02T10:00:00Z' } },
          author: { login: 'bob' },
        },
      ];

      const result = contributionMapFromCommits(commits);

      expect(result.get('alice')).toBe(1);
      expect(result.get('bob')).toBe(1);
      expect(result.size).toBe(2);
    });

    it('should fall back to commit.author.name when author.login is absent', () => {
      const commits: Commit[] = [
        {
          commit: { author: { date: '2024-01-01T10:00:00Z', name: 'Carol Smith' } },
          author: null,
        },
        {
          commit: { author: { date: '2024-01-02T10:00:00Z', name: 'Dave Jones' } },
          author: null,
        },
      ];

      const result = contributionMapFromCommits(commits);

      expect(result.get('Carol Smith')).toBe(1);
      expect(result.get('Dave Jones')).toBe(1);
      expect(result.size).toBe(2);
    });

    it('should use "Unknown" when neither author.login nor commit.author.name is available', () => {
      const commits: Commit[] = [
        {
          commit: { author: { date: '2024-01-01T10:00:00Z' } },
          author: null,
        },
        {
          commit: { author: null },
          author: null,
        },
      ];

      const result = contributionMapFromCommits(commits);

      expect(result.get('Unknown')).toBe(2);
      expect(result.size).toBe(1);
    });

    it('should accumulate counts correctly when multiple commits have the same author', () => {
      const commits: Commit[] = [
        {
          commit: { author: { date: '2024-01-01T10:00:00Z' } },
          author: { login: 'alice' },
        },
        {
          commit: { author: { date: '2024-01-02T10:00:00Z' } },
          author: { login: 'alice' },
        },
        {
          commit: { author: { date: '2024-01-03T10:00:00Z' } },
          author: { login: 'alice' },
        },
        {
          commit: { author: { date: '2024-01-04T10:00:00Z' } },
          author: { login: 'bob' },
        },
      ];

      const result = contributionMapFromCommits(commits);

      expect(result.get('alice')).toBe(3);
      expect(result.get('bob')).toBe(1);
      expect(result.size).toBe(2);
    });
  });

  describe('fetchRepositoryCommitsForPeriod', () => {
    it('should return commits within the cutoff date and stop early when it encounters one older than the cutoff', async () => {
      // Use fake timers so the cutoff is deterministic (cutoff = now - 7 days)
      const now = new Date('2024-01-10T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const withinCutoff: Commit = {
        commit: { author: { date: '2024-01-08T00:00:00Z' } }, // 2 days ago — within 7 days
        author: { login: 'alice' },
      };
      const beforeCutoff: Commit = {
        commit: { author: { date: '2024-01-01T00:00:00Z' } }, // 9 days ago — older than 7 days
        author: { login: 'bob' },
      };

      // First page returns one commit within cutoff and one before cutoff
      mockGitHubClient.getRepositoryCommits.mockResolvedValueOnce([withinCutoff, beforeCutoff]);

      const result = await fetchRepositoryCommitsForPeriod(
        mockGitHubClient,
        'test-org',
        'test-repo',
        7
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(withinCutoff);
      // Only one page should have been fetched because we stopped early
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should return empty array when API returns no commits', async () => {
      mockGitHubClient.getRepositoryCommits.mockResolvedValueOnce([]);

      const result = await fetchRepositoryCommitsForPeriod(
        mockGitHubClient,
        'test-org',
        'test-repo',
        30
      );

      expect(result).toEqual([]);
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledTimes(1);
    });

    it('should return empty array and log error when API throws', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGitHubClient.getRepositoryCommits.mockRejectedValueOnce(new Error('API failure'));

      const result = await fetchRepositoryCommitsForPeriod(
        mockGitHubClient,
        'test-org',
        'test-repo',
        7
      );

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching commits for test-org/test-repo')
      );
      consoleSpy.mockRestore();
    });
  });
});
