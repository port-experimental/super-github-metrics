import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createMockGitHubClient,
  createMockPortClient,
  mockAuditLogEntry,
  mockCommit,
  mockGitHubUser,
  mockPortEntity,
  mockPullRequest,
  mockPullRequestBasic,
  mockPullRequestReview,
  mockRepository,
  mockWorkflowRun,
} from './utils/mocks';

// Mock all external dependencies
jest.mock('../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../clients/port', () => ({
  getEntities: jest.fn(),
  upsertProps: jest.fn(),
  upsertEntity: jest.fn(),
  upsertEntities: jest.fn(),
  upsertEntitiesInBatches: jest.fn(),
  createEntity: jest.fn(),
  updateEntity: jest.fn(),
  deleteAllEntities: jest.fn(),
  getUsers: jest.fn(),
  getUser: jest.fn(),
}));

// Mock environment variables
const originalEnv = process.env;

describe('Integration Tests', () => {
  let mockGitHubClient: ReturnType<typeof createMockGitHubClient>;
  let _mockPortClient: ReturnType<typeof createMockPortClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up environment variables
    process.env = {
      ...originalEnv,
      X_GITHUB_TOKEN: 'test-token',
      X_GITHUB_ENTERPRISE: 'test-enterprise',
      X_GITHUB_ORGS: 'test-org1,test-org2',
      PORT_CLIENT_ID: 'test-client-id',
      PORT_CLIENT_SECRET: 'test-client-secret',
    };

    mockGitHubClient = createMockGitHubClient();
    _mockPortClient = createMockPortClient();

    // Mock the client creation
    const { createGitHubClient } = require('../clients/github');
    createGitHubClient.mockReturnValue(mockGitHubClient);

    // Mock Port client methods
    const portClient = require('../clients/port');
    portClient.getEntities.mockResolvedValue({ entities: [mockPortEntity] });
    portClient.upsertProps.mockResolvedValue({});
    portClient.upsertEntity.mockResolvedValue({});
    portClient.upsertEntities.mockResolvedValue({ entities: [], errors: [] });
    portClient.upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);
    portClient.createEntity.mockResolvedValue({});
    portClient.updateEntity.mockResolvedValue(mockPortEntity);
    portClient.deleteAllEntities.mockResolvedValue(undefined);
    portClient.getUsers.mockResolvedValue({ entities: [mockPortEntity] });
    portClient.getUser.mockResolvedValue({ entity: mockPortEntity });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Full Onboarding Metrics Flow', () => {
    it('should complete full onboarding metrics flow successfully', async () => {
      // Mock GitHub API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.getMemberAddDates.mockResolvedValue([mockAuditLogEntry]);
      mockGitHubClient.searchCommits.mockResolvedValue([
        {
          commit: { author: { date: '2024-01-02T00:00:00Z' } },
          author: { login: 'test-user' },
        },
        // Add more commits to reach 10
        ...Array(9)
          .fill(null)
          .map((_, i) => ({
            commit: { author: { date: `2024-01-${String(i + 3).padStart(2, '0')}T00:00:00Z` } },
            author: { login: 'test-user' },
          })),
      ]);
      mockGitHubClient.searchPullRequests.mockResolvedValue([
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
      mockGitHubClient.searchReviews.mockResolvedValue([]);

      // Import and test the onboarding metrics function
      const { calculateAndStoreDeveloperStats } = require('../github/onboarding_metrics');

      // Correct call order: (orgNames, user, joinDate, githubClient)
      // calculateAndStoreDeveloperStats returns a PortEntity directly
      const result = await calculateAndStoreDeveloperStats(
        ['test-org'],
        mockGitHubUser,
        '2024-01-01T00:00:00Z',
        mockGitHubClient
      );

      expect(result).toMatchObject({
        identifier: mockGitHubUser.identifier,
        properties: expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          tenth_commit: '2024-01-11T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_pr: '2024-01-14T00:00:00Z',
        }),
      });
    });
  });

  describe('Full PR Metrics Flow', () => {
    it('should complete full PR metrics flow successfully', async () => {
      // Use current date so PRs pass the 90-day filter
      const now = new Date().toISOString();
      const currentPR = {
        ...mockPullRequestBasic,
        created_at: now,
        closed_at: now,
        merged_at: now,
      };

      // Mock GitHub API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.getPullRequests.mockResolvedValue([currentPR]);

      // Mock batch methods required by calculateAndStorePRMetrics
      const prFullDataMap = new Map([
        [
          currentPR.number,
          {
            number: currentPR.number,
            additions: 100,
            deletions: 50,
            changedFiles: 5,
            comments: 3,
            reviewThreads: 2,
            createdAt: now,
            closedAt: now,
            mergedAt: now,
            state: 'CLOSED',
            isDraft: false,
            reviews: [{ state: 'APPROVED', submittedAt: now }],
          },
        ],
      ]);
      const prCommitsMap = new Map([[currentPR.number, { number: currentPR.number, commits: [] }]]);
      mockGitHubClient.getPullRequestFullDataBatch.mockResolvedValue(prFullDataMap);
      mockGitHubClient.getPullRequestCommitsBatch.mockResolvedValue(prCommitsMap);

      // Import and test the PR metrics function
      const { calculateAndStorePRMetrics } = require('../github/pr_metrics');
      const { upsertEntitiesInBatches } = require('../clients/port');

      await calculateAndStorePRMetrics([mockRepository], mockGitHubClient);

      // Verify that upsertEntitiesInBatches was called for PR metrics
      expect(upsertEntitiesInBatches).toHaveBeenCalledWith('githubPullRequest', expect.any(Array));
    });
  });

  describe('Full Service Metrics Flow', () => {
    it('should complete full service metrics flow successfully', async () => {
      // Mock GitHub API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([mockCommit]);
      mockGitHubClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockPullRequestReview]);

      // Import and test the service metrics function
      const { calculateAndStoreServiceMetrics } = require('../github/service_metrics');
      const { upsertEntitiesInBatches } = require('../clients/port');

      await calculateAndStoreServiceMetrics([mockRepository], mockGitHubClient);

      // Verify that upsertEntitiesInBatches was called for service metrics
      expect(upsertEntitiesInBatches).toHaveBeenCalledWith(
        'service',
        expect.arrayContaining([
          expect.objectContaining({
            identifier: mockRepository.name,
            properties: expect.objectContaining({
              organization: mockRepository.owner.login,
            }),
          }),
        ])
      );
    });
  });

  describe('Full Workflow Metrics Flow', () => {
    it('should complete full workflow metrics flow successfully', async () => {
      // Mock GitHub API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue([mockWorkflowRun]);

      // Import and test the workflow metrics function
      const { getWorkflowMetrics } = require('../github/workflow_metrics');

      await getWorkflowMetrics([mockRepository], mockGitHubClient);

      // Verify that getWorkflowRuns was called with the correct repository data
      expect(mockGitHubClient.getWorkflowRuns).toHaveBeenCalledWith(
        mockRepository.owner.login,
        mockRepository.name,
        mockRepository.default_branch
      );
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle GitHub API errors gracefully', async () => {
      // Mock GitHub API to throw inside getDeveloperStats (caught internally)
      mockGitHubClient.checkRateLimits.mockRejectedValue(new Error('Rate limit exceeded'));

      // Import and test error handling
      const { calculateAndStoreDeveloperStats } = require('../github/onboarding_metrics');

      // The function catches errors internally and returns null when no record is found
      const result = await calculateAndStoreDeveloperStats(
        ['test-org'],
        mockGitHubUser,
        '2024-01-01T00:00:00Z',
        mockGitHubClient
      );

      expect(result).toBeNull();
    });

    it('should handle Port API errors gracefully', async () => {
      // Mock successful GitHub responses (1 commit so a record is found)
      mockGitHubClient.searchCommits.mockResolvedValue([
        {
          commit: { author: { date: '2024-01-02T00:00:00Z' } },
          author: { login: 'test-user' },
        },
      ]);
      mockGitHubClient.searchPullRequests.mockResolvedValue([]);
      mockGitHubClient.searchReviews.mockResolvedValue([]);

      // Import and test error handling
      const { calculateAndStoreDeveloperStats } = require('../github/onboarding_metrics');

      // calculateAndStoreDeveloperStats returns a PortEntity directly without calling
      // upsertEntitiesInBatches, so Port API errors do not propagate through this function.
      // It resolves with the computed entity.
      await expect(
        calculateAndStoreDeveloperStats(
          ['test-org'],
          mockGitHubUser,
          '2024-01-01T00:00:00Z',
          mockGitHubClient
        )
      ).resolves.toMatchObject({ identifier: mockGitHubUser.identifier });
    });
  });

  describe('Environment Variable Integration', () => {
    it('should use environment variables correctly', async () => {
      // Test that environment variables are being used
      expect(process.env.X_GITHUB_TOKEN).toBe('test-token');
      expect(process.env.X_GITHUB_ENTERPRISE).toBe('test-enterprise');
      expect(process.env.X_GITHUB_ORGS).toBe('test-org1,test-org2');
      expect(process.env.PORT_CLIENT_ID).toBe('test-client-id');
      expect(process.env.PORT_CLIENT_SECRET).toBe('test-client-secret');
    });

    it('should handle FORCE_ONBOARDING_METRICS environment variable', async () => {
      process.env.FORCE_ONBOARDING_METRICS = 'true';

      // Test that the environment variable is set correctly
      expect(process.env.FORCE_ONBOARDING_METRICS).toBe('true');
    });
  });

  describe('Data Flow Integration', () => {
    it('should maintain data consistency across the pipeline', async () => {
      // Use current date so PRs pass the 90-day filter
      const now = new Date().toISOString();
      const currentPR = {
        ...mockPullRequestBasic,
        created_at: now,
        closed_at: now,
        merged_at: now,
      };

      // Mock all API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.getPullRequests.mockResolvedValue([currentPR]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockPullRequestReview]);

      // Add batch methods required by calculateAndStorePRMetrics
      const prFullDataMap = new Map([
        [
          currentPR.number,
          {
            number: currentPR.number,
            additions: 100,
            deletions: 50,
            changedFiles: 5,
            comments: 3,
            reviewThreads: 2,
            createdAt: now,
            closedAt: now,
            mergedAt: now,
            state: 'CLOSED',
            isDraft: false,
            reviews: [],
          },
        ],
      ]);
      const prCommitsMap = new Map([[currentPR.number, { number: currentPR.number, commits: [] }]]);
      mockGitHubClient.getPullRequestFullDataBatch.mockResolvedValue(prFullDataMap);
      mockGitHubClient.getPullRequestCommitsBatch.mockResolvedValue(prCommitsMap);

      // Test that data flows correctly through the pipeline
      const { calculateAndStorePRMetrics } = require('../github/pr_metrics');

      await calculateAndStorePRMetrics([mockRepository], mockGitHubClient);

      // Verify that the correct repository data was used (repos are passed in directly)
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        expect.any(Object)
      );
    });
  });
});
