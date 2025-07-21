import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createMockGitHubClient, createMockPortClient, mockRepository, mockPullRequestBasic, mockPullRequest, mockPullRequestReview, mockCommit, mockWorkflowRun, mockAuditLogEntry, mockGitHubUser, mockPortEntity } from './utils/mocks';

// Mock all external dependencies
jest.mock('../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../clients/port', () => ({
  getEntities: jest.fn(),
  upsertProps: jest.fn(),
  upsertEntity: jest.fn(),
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
  let mockPortClient: ReturnType<typeof createMockPortClient>;

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
    mockPortClient = createMockPortClient();

    // Mock the client creation
    const { createGitHubClient } = require('../clients/github');
    createGitHubClient.mockReturnValue(mockGitHubClient);

    // Mock Port client methods
    const portClient = require('../clients/port');
    portClient.getEntities.mockResolvedValue({ entities: [mockPortEntity] });
    portClient.upsertProps.mockResolvedValue({});
    portClient.upsertEntity.mockResolvedValue({});
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
        ...Array(9).fill(null).map((_, i) => ({
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
        ...Array(9).fill(null).map((_, i) => ({
          id: i + 2,
          number: i + 2,
          created_at: `2024-01-${String(i + 6).padStart(2, '0')}T00:00:00Z`,
          closed_at: `2024-01-${String(i + 7).padStart(2, '0')}T00:00:00Z`,
          merged_at: `2024-01-${String(i + 7).padStart(2, '0')}T00:00:00Z`,
          user: { login: 'test-user' },
        })),
      ]);

      // Import and test the onboarding metrics function
      const { calculateAndStoreDeveloperStats } = require('../github/onboarding_metrics');
      const { upsertProps } = require('../clients/port');

      await calculateAndStoreDeveloperStats(
        ['test-org'],
        'test-token',
        mockGitHubUser,
        '2024-01-01T00:00:00Z'
      );

      // Verify that upsertProps was called with the correct metrics
      expect(upsertProps).toHaveBeenCalledWith(
        'githubUser',
        mockGitHubUser.identifier,
        expect.objectContaining({
          first_commit: '2024-01-02T00:00:00Z',
          tenth_commit: '2024-01-11T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_pr: '2024-01-14T00:00:00Z',
        })
      );
    });
  });

  describe('Full PR Metrics Flow', () => {
    it('should complete full PR metrics flow successfully', async () => {
      // Mock GitHub API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockPullRequestReview]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([mockCommit]);

      // Import and test the PR metrics function
      const { calculateAndStorePRMetrics } = require('../github/pr_metrics');
      const { upsertProps } = require('../clients/port');

      await calculateAndStorePRMetrics([mockRepository], 'test-token');

      // Verify that upsertProps was called for PR metrics
      expect(upsertProps).toHaveBeenCalledWith(
        'githubPullRequest',
        expect.stringContaining('test-repo'),
        expect.objectContaining({
          pr_size: expect.any(Number),
          pr_lifetime: expect.any(Number),
          pr_pickup_time: expect.any(Number),
          pr_approve_time: expect.any(Number),
          pr_merge_time: expect.any(Number),
          pr_maturity: expect.any(Number),
          pr_success_rate: expect.any(Number),
          review_participation: expect.any(Number),
        })
      );
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
      const { upsertEntity } = require('../clients/port');

      const reposWithStringId = [{ ...mockRepository, id: mockRepository.id.toString() }];
      await calculateAndStoreServiceMetrics(reposWithStringId, 'test-token');

      // Verify that upsertEntity was called for service metrics
      expect(upsertEntity).toHaveBeenCalledWith(
        'service',
        expect.stringContaining('test-repo'),
        expect.any(String),
        expect.objectContaining({
          organization: 'test-owner',
          number_of_prs_reviewed_1d: expect.any(Number),
          number_of_prs_reviewed_7d: expect.any(Number),
          number_of_prs_reviewed_30d: expect.any(Number),
          number_of_prs_reviewed_90d: expect.any(Number),
        }),
        {},
        null
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
      const { upsertEntity } = require('../clients/port');

      await getWorkflowMetrics([mockRepository], 'test-token');

      // Verify that upsertEntity was called for workflow metrics
      expect(upsertEntity).toHaveBeenCalledWith(
        'githubWorkflow',
        expect.stringContaining('test-workflow'),
        expect.any(String),
        expect.objectContaining({
          repository: 'test-repo',
          workflowName: 'test-workflow',
          successRate: expect.any(Number),
          averageDuration: expect.any(Number),
          totalRuns: expect.any(Number),
          lastRunStatus: expect.any(String),
          lastRunDate: expect.any(String),
        }),
        {},
        null
      );
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle GitHub API errors gracefully', async () => {
      // Mock GitHub API errors
      mockGitHubClient.checkRateLimits.mockRejectedValue(new Error('Rate limit exceeded'));

      // Import and test error handling
      const { calculateAndStoreDeveloperStats } = require('../github/onboarding_metrics');

      // The function should handle the error gracefully
      await expect(calculateAndStoreDeveloperStats(
        ['test-org'],
        'test-token',
        mockGitHubUser,
        '2024-01-01T00:00:00Z'
      )).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle Port API errors gracefully', async () => {
      // Mock Port API errors
      const { upsertProps } = require('../clients/port');
      upsertProps.mockRejectedValue(new Error('Port API error'));

      // Mock successful GitHub responses
      mockGitHubClient.searchCommits.mockResolvedValue([
        {
          commit: { author: { date: '2024-01-02T00:00:00Z' } },
          author: { login: 'test-user' },
        },
      ]);
      mockGitHubClient.searchPullRequests.mockResolvedValue([]);

      // Import and test error handling
      const { calculateAndStoreDeveloperStats } = require('../github/onboarding_metrics');

      // The function should handle the error gracefully
      await expect(calculateAndStoreDeveloperStats(
        ['test-org'],
        'test-token',
        mockGitHubUser,
        '2024-01-01T00:00:00Z'
      )).rejects.toThrow('Port API error');
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
      // Mock all API responses
      mockGitHubClient.checkRateLimits.mockResolvedValue(undefined);
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockPullRequestReview]);

      // Test that data flows correctly through the pipeline
      const { calculateAndStorePRMetrics } = require('../github/pr_metrics');

      await calculateAndStorePRMetrics([mockRepository], 'test-token');

      // Verify that the correct repository data was used
      expect(mockGitHubClient.fetchOrganizationRepositories).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        expect.any(Object)
      );
    });
  });
}); 