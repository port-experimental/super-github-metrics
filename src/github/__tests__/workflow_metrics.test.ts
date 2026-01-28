import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { calculateWorkflowMetrics } from '../workflow_metrics';
import { createMockGitHubClient, createMockPortClient } from '../../__tests__/utils/mocks';
import type { WorkflowRun, Repository } from '../../clients/github/types';

// Mock the clients
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  PortClient: {
    getInstance: jest.fn(),
  },
}));

describe('Workflow Metrics', () => {
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

  describe('calculateWorkflowMetrics', () => {
    const mockRepository: Repository = {
      id: 123456,
      name: 'test-repo',
      owner: {
        login: 'test-org',
      },
      default_branch: 'main',
    };

    const mockWorkflowRun: WorkflowRun = {
      id: 123,
      workflow_id: 456,
      name: 'test-workflow',
      conclusion: 'success',
      run_number: 1,
      run_started_at: '2024-01-01T10:00:00Z',
      updated_at: '2024-01-01T10:05:00Z',
      event: 'push',
    };

    it('should calculate workflow metrics successfully', async () => {
      // Setup mocks
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue([mockWorkflowRun]);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      // Verify GitHub client calls
      expect(mockGitHubClient.fetchOrganizationRepositories).toHaveBeenCalledWith(orgName);
      expect(mockGitHubClient.getWorkflowRuns).toHaveBeenCalledWith(
        'test-org',
        'test-repo',
        'main'
      );
    });

    it('should handle empty repository list', async () => {
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([]);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      expect(mockGitHubClient.fetchOrganizationRepositories).toHaveBeenCalled();
      expect(mockGitHubClient.getWorkflowRuns).not.toHaveBeenCalled();
    });

    it('should handle repositories without workflow runs', async () => {
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue([]);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      expect(mockGitHubClient.getWorkflowRuns).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.fetchOrganizationRepositories.mockRejectedValue(new Error('API Error'));

      const orgName = 'test-org';

      await expect(
        calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName)
      ).rejects.toThrow('API Error');
    });

    it('should calculate correct workflow success rates', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

      const testWorkflowRuns: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 1,
          run_started_at: oneDayAgo.toISOString(),
          updated_at: new Date(oneDayAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 2,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'failure',
          run_number: 2,
          run_started_at: twoDaysAgo.toISOString(),
          updated_at: new Date(twoDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 3,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 3,
          run_started_at: threeDaysAgo.toISOString(),
          updated_at: new Date(threeDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 4,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'cancelled',
          run_number: 4,
          run_started_at: fourDaysAgo.toISOString(),
          updated_at: new Date(fourDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue(testWorkflowRuns);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      // Verify that upsertProps was called with the correct metrics
      expect(mockPortClient.upsertProps).toHaveBeenCalledWith(
        'githubWorkflow',
        'test-repo-456',
        expect.objectContaining({
          repositoryName: 'test-repo',
          workflowId: '456',
          workflowName: 'test-workflow',
          successRate_last_30_days: 66.66666666666666, // 2 successful out of 3 total (excluding cancelled)
          totalRuns_last_30_days: 3,
          totalFailures_last_30_days: 1,
        })
      );
    });

    it('should handle workflow runs with null conclusions', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const testWorkflowRuns: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: null, // Running workflow
          run_number: 1,
          run_started_at: oneDayAgo.toISOString(),
          updated_at: new Date(oneDayAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 2,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 2,
          run_started_at: twoDaysAgo.toISOString(),
          updated_at: new Date(twoDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue(testWorkflowRuns);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      // Should exclude running workflows (null conclusion)
      expect(mockPortClient.upsertProps).toHaveBeenCalledWith(
        'githubWorkflow',
        'test-repo-456',
        expect.objectContaining({
          repositoryName: 'test-repo',
          workflowId: '456',
          workflowName: 'test-workflow',
          successRate_last_30_days: 100, // 1 successful out of 1 completed
          totalRuns_last_30_days: 1,
          totalFailures_last_30_days: 0,
        })
      );
    });

    it('should handle multiple repositories', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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

      const workflowRuns1: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 1,
          run_started_at: oneDayAgo.toISOString(),
          updated_at: new Date(oneDayAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
      ];

      const workflowRuns2: WorkflowRun[] = [
        {
          id: 2,
          workflow_id: 789,
          name: 'another-workflow',
          conclusion: 'success',
          run_number: 1,
          run_started_at: oneDayAgo.toISOString(),
          updated_at: new Date(oneDayAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([repo1, repo2]);
      mockGitHubClient.getWorkflowRuns
        .mockResolvedValueOnce(workflowRuns1)
        .mockResolvedValueOnce(workflowRuns2);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      // Should be called for each repository
      expect(mockPortClient.upsertProps).toHaveBeenCalledTimes(2);
      expect(mockPortClient.upsertProps).toHaveBeenNthCalledWith(
        1,
        'githubWorkflow',
        'repo1-456',
        expect.objectContaining({
          repositoryName: 'repo1',
          workflowId: '456',
          workflowName: 'test-workflow',
        })
      );
      expect(mockPortClient.upsertProps).toHaveBeenNthCalledWith(
        2,
        'githubWorkflow',
        'repo2-789',
        expect.objectContaining({
          repositoryName: 'repo2',
          workflowId: '789',
          workflowName: 'another-workflow',
        })
      );
    });

    it('should handle workflow runs with different conclusion types', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

      const testWorkflowRuns: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 1,
          run_started_at: oneDayAgo.toISOString(),
          updated_at: new Date(oneDayAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 2,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'failure',
          run_number: 2,
          run_started_at: twoDaysAgo.toISOString(),
          updated_at: new Date(twoDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 3,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'cancelled',
          run_number: 3,
          run_started_at: threeDaysAgo.toISOString(),
          updated_at: new Date(threeDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
        {
          id: 4,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'skipped',
          run_number: 4,
          run_started_at: fourDaysAgo.toISOString(),
          updated_at: new Date(fourDaysAgo.getTime() + 5 * 60 * 1000).toISOString(),
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue(testWorkflowRuns);

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient, orgName);

      // Should count only success/failure as total runs, exclude others
      expect(mockPortClient.upsertProps).toHaveBeenCalledWith(
        'githubWorkflow',
        'test-repo-456',
        expect.objectContaining({
          repositoryName: 'test-repo',
          workflowId: '456',
          workflowName: 'test-workflow',
          successRate_last_30_days: 50, // 1 successful out of 2 total (success/failure only)
          totalRuns_last_30_days: 2,
          totalFailures_last_30_days: 1,
        })
      );
    });
  });
});
