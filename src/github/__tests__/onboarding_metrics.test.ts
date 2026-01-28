import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  calculateAndStoreDeveloperStats,
  hasCompleteOnboardingMetrics,
} from '../onboarding_metrics';
import {
  createMockGitHubClient,
  createMockPortClient,
  mockGitHubUser,
  mockPortEntity,
  mockCommit,
  mockPullRequestBasic,
  mockPullRequestReview,
} from '../../__tests__/utils/mocks';

// Mock the clients
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  upsertEntity: jest.fn(),
  getEntities: jest.fn(),
}));

describe('Onboarding Metrics', () => {
  let mockGitHubClient: ReturnType<typeof createMockGitHubClient>;
  let mockPortClient: ReturnType<typeof createMockPortClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGitHubClient = createMockGitHubClient();
    mockPortClient = createMockPortClient();

    // Mock the client creation
    const { createGitHubClient } = require('../../clients/github');
    createGitHubClient.mockReturnValue(mockGitHubClient);

    const { upsertEntity, getEntities } = require('../../clients/port');
    upsertEntity.mockResolvedValue({});
    getEntities.mockResolvedValue({ entities: [mockPortEntity] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('hasCompleteOnboardingMetrics', () => {
    it('should return true when all onboarding metrics are present', () => {
      const userWithCompleteMetrics = {
        ...mockPortEntity,
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          tenth_commit: '2024-01-10T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_pr: '2024-01-15T00:00:00Z',
          time_to_first_commit: 86400,
          time_to_first_pr: 345600,
          time_to_10th_commit: 777600,
          time_to_10th_pr: 1209600,
          initial_review_response_time: 3600,
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithCompleteMetrics)).toBe(true);
    });

    it('should return false when onboarding metrics are missing', () => {
      const userWithIncompleteMetrics = {
        ...mockPortEntity,
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          // Missing other metrics
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithIncompleteMetrics)).toBe(false);
    });

    it('should return false when properties are undefined', () => {
      const userWithoutProperties = {
        ...mockPortEntity,
        properties: undefined,
      };

      expect(hasCompleteOnboardingMetrics(userWithoutProperties)).toBe(false);
    });

    it('should return false when properties are null', () => {
      const userWithNullProperties = {
        ...mockPortEntity,
        properties: null,
      };

      expect(hasCompleteOnboardingMetrics(userWithNullProperties)).toBe(false);
    });

    it('should return false when some metrics are null or empty', () => {
      const userWithPartialMetrics = {
        ...mockPortEntity,
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          tenth_commit: null,
          first_pr: '',
          tenth_pr: '2024-01-15T00:00:00Z',
          time_to_first_commit: 86400,
          time_to_first_pr: null,
          time_to_10th_commit: 777600,
          time_to_10th_pr: 1209600,
          initial_review_response_time: 3600,
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithPartialMetrics)).toBe(false);
    });
  });

  describe('calculateAndStoreDeveloperStats', () => {
    const testOrgs = ['test-org'];
    const testJoinDate = '2024-01-01T00:00:00Z';

    beforeEach(() => {
      // Reset mock data for each test
      (mockGitHubClient.searchCommits as any).mockReset();
      (mockGitHubClient.searchPullRequests as any).mockReset();
      (mockGitHubClient.searchReviews as any).mockReset();
    });

    it('should calculate and store developer stats successfully', async () => {
      // Set up mock data for this specific test
      (mockGitHubClient.searchCommits as any).mockResolvedValue([
        {
          commit: { author: { date: '2024-01-02T00:00:00Z' } },
          author: { login: 'test-user' },
        },
        {
          commit: { author: { date: '2024-01-03T00:00:00Z' } },
          author: { login: 'test-user' },
        },
        // Add more commits to reach 10
        ...Array(8)
          .fill(null)
          .map((_, i) => ({
            commit: { author: { date: `2024-01-${String(i + 4).padStart(2, '0')}T00:00:00Z` } },
            author: { login: 'test-user' },
          })),
      ]);

      (mockGitHubClient.searchPullRequests as any).mockResolvedValue([
        {
          id: 1,
          number: 1,
          created_at: '2024-01-05T00:00:00Z',
          closed_at: '2024-01-06T00:00:00Z',
          merged_at: '2024-01-06T00:00:00Z',
          user: { login: 'test-user' },
        },
        // Add more PRs to reach 10
        ...Array(9)
          .fill(null)
          .map((_, i) => ({
            id: i + 2,
            number: i + 2,
            created_at: `2024-01-${String(i + 6).padStart(2, '0')}T00:00:00Z`,
            closed_at: `2024-01-${String(i + 7).padStart(2, '0')}T00:00:00Z`,
            merged_at: `2024-01-${String(i + 7).padStart(2, '0')}T00:00:00Z`,
            user: { login: 'test-user' },
          })),
      ]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      // Verify that upsertEntity was called with the correct metrics
      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_commit: '2024-01-11T00:00:00Z',
          tenth_pr: '2024-01-14T00:00:00Z',
          time_to_first_commit: 24, // 24 hours from join date to first commit
          time_to_first_pr: 96, // 96 hours from join date to first PR (4 days)
          time_to_10th_commit: 240, // 240 hours from join date to 10th commit
          time_to_10th_pr: 312, // 312 hours from join date to 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle case with fewer than 10 commits', async () => {
      (mockGitHubClient.searchCommits as any).mockResolvedValue([
        {
          commit: { author: { date: '2024-01-02T00:00:00Z' } },
          author: { login: 'test-user' },
        },
        {
          commit: { author: { date: '2024-01-03T00:00:00Z' } },
          author: { login: 'test-user' },
        },
      ]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_commit: null, // Only 2 commits, so no 10th commit
          tenth_pr: '2024-01-14T00:00:00Z',
          time_to_first_commit: 24, // 24 hours from join date to first commit
          time_to_first_pr: 96, // 96 hours from join date to first PR
          time_to_10th_commit: null, // No 10th commit
          time_to_10th_pr: 312, // 312 hours from join date to 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle case with fewer than 10 PRs', async () => {
      (mockGitHubClient.searchPullRequests as any).mockResolvedValue([
        {
          id: 1,
          number: 1,
          created_at: '2024-01-05T00:00:00Z',
          closed_at: '2024-01-06T00:00:00Z',
          merged_at: '2024-01-06T00:00:00Z',
          user: { login: 'test-user' },
        },
      ]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_commit: '2024-01-11T00:00:00Z',
          tenth_pr: null, // Only 1 PR, so no 10th PR
          time_to_first_commit: 24, // 24 hours from join date to first commit
          time_to_first_pr: 96, // 96 hours from join date to first PR
          time_to_10th_commit: 240, // 240 hours from join date to 10th commit
          time_to_10th_pr: null, // No 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle case with no commits', async () => {
      (mockGitHubClient.searchCommits as any).mockResolvedValue([]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: null, // No commits
          first_pr: '2024-01-05T00:00:00Z',
          tenth_commit: null, // No commits
          tenth_pr: '2024-01-14T00:00:00Z',
          time_to_first_commit: null, // No commits
          time_to_first_pr: 96, // 96 hours from join date to first PR
          time_to_10th_commit: null, // No commits
          time_to_10th_pr: 312, // 312 hours from join date to 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle case with no PRs', async () => {
      (mockGitHubClient.searchPullRequests as any).mockResolvedValue([]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          first_pr: null, // No PRs
          tenth_commit: '2024-01-11T00:00:00Z',
          tenth_pr: null, // No PRs
          time_to_first_commit: 24, // 24 hours from join date to first commit
          time_to_first_pr: null, // No PRs
          time_to_10th_commit: 240, // 240 hours from join date to 10th commit
          time_to_10th_pr: null, // No PRs
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle API errors gracefully', async () => {
      (mockGitHubClient.searchCommits as any).mockRejectedValue(new Error('API Error'));

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      // Should still call upsertEntity with null values for failed metrics
      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: null, // API error, so no commits
          first_pr: '2024-01-05T00:00:00Z',
          tenth_commit: null, // API error, so no commits
          tenth_pr: '2024-01-14T00:00:00Z',
          time_to_first_commit: null, // API error, so no commits
          time_to_first_pr: 96, // 96 hours from join date to first PR
          time_to_10th_commit: null, // API error, so no commits
          time_to_10th_pr: 312, // 312 hours from join date to 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle commits with missing dates', async () => {
      (mockGitHubClient.searchCommits as any).mockResolvedValue([
        {
          commit: { author: { date: '2024-01-03T00:00:00Z' } },
          author: { login: 'test-user' },
        },
        {
          commit: { author: { date: null } }, // Missing date
          author: { login: 'test-user' },
        },
      ]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: '2024-01-03T00:00:00Z', // Only the commit with a valid date
          first_pr: '2024-01-05T00:00:00Z',
          tenth_commit: null, // Only 1 valid commit, so no 10th commit
          tenth_pr: '2024-01-14T00:00:00Z',
          time_to_first_commit: 48, // 48 hours from join date to first commit
          time_to_first_pr: 96, // 96 hours from join date to first PR
          time_to_10th_commit: null, // No 10th commit
          time_to_10th_pr: 312, // 312 hours from join date to 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });

    it('should handle PRs with missing dates', async () => {
      (mockGitHubClient.searchPullRequests as any).mockResolvedValue([
        {
          id: 1,
          number: 1,
          created_at: '2024-01-05T00:00:00Z',
          closed_at: null, // Missing date
          merged_at: null,
          user: { login: 'test-user' },
        },
      ]);

      const { upsertEntity } = require('../../clients/port');
      upsertEntity.mockResolvedValue({});

      await calculateAndStoreDeveloperStats(
        testOrgs,
        mockGitHubUser,
        testJoinDate,
        mockGitHubClient
      );

      expect(upsertEntity).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        mockGitHubUser.title || '',
        expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z', // Only the PR with a valid date
          tenth_commit: '2024-01-11T00:00:00Z',
          tenth_pr: null, // Only 1 valid PR, so no 10th PR
          time_to_first_commit: 24, // 24 hours from join date to first commit
          time_to_first_pr: 96, // 96 hours from join date to first PR
          time_to_10th_commit: 240, // 240 hours from join date to 10th commit
          time_to_10th_pr: null, // No 10th PR
          initial_review_response_time: 15,
          join_date: '2024-01-01T00:00:00Z',
          login: 'test-user',
        }),
        mockGitHubUser.relations || {}
      );
    });
  });
});
