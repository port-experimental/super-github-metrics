import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { calculateWorkflowMetrics } from '../workflow_metrics';
import { createMockGitHubClient, createMockPortClient } from '../../__tests__/utils/mocks';
import type { WorkflowRun, Repository } from '../../types/github';

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
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      // Verify GitHub client calls
      expect(mockGitHubClient.fetchOrganizationRepositories).toHaveBeenCalledWith(orgName);
      expect(mockGitHubClient.getWorkflowRuns).toHaveBeenCalledWith('test-org', 'test-repo');
    });

    it('should handle empty repository list', async () => {
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      expect(mockGitHubClient.fetchOrganizationRepositories).toHaveBeenCalled();
      expect(mockGitHubClient.getWorkflowRuns).not.toHaveBeenCalled();
    });

    it('should handle repositories without workflow runs', async () => {
      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue([]);
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      expect(mockGitHubClient.getWorkflowRuns).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.fetchOrganizationRepositories.mockRejectedValue(new Error('API Error'));
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
      });

      const orgName = 'test-org';

      await expect(
        calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName)
      ).rejects.toThrow('API Error');
    });

    it('should calculate correct workflow success rates', async () => {
      const testWorkflowRuns: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 1,
          run_started_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          event: 'push',
        },
        {
          id: 2,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'failure',
          run_number: 2,
          run_started_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:05:00Z',
          event: 'push',
        },
        {
          id: 3,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 3,
          run_started_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:05:00Z',
          event: 'push',
        },
        {
          id: 4,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'cancelled',
          run_number: 4,
          run_started_at: '2024-01-01T13:00:00Z',
          updated_at: '2024-01-01T13:05:00Z',
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue(testWorkflowRuns);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      // Verify that upsertProps was called with the correct metrics
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_repository',
        'test-repo',
        expect.objectContaining({
          workflow_success_rate: 0.5, // 2 successful out of 4 total (excluding cancelled)
          workflow_total_runs: 3, // excluding cancelled runs
          workflow_successful_runs: 2,
        })
      );
    });

    it('should handle workflow runs with null conclusions', async () => {
      const testWorkflowRuns: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: null, // Running workflow
          run_number: 1,
          run_started_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          event: 'push',
        },
        {
          id: 2,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 2,
          run_started_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:05:00Z',
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue(testWorkflowRuns);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      // Should exclude running workflows (null conclusion)
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_repository',
        'test-repo',
        expect.objectContaining({
          workflow_success_rate: 1.0, // 1 successful out of 1 completed
          workflow_total_runs: 1,
          workflow_successful_runs: 1,
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

      const workflowRuns1: WorkflowRun[] = [
        {
          id: 1,
          workflow_id: 456,
          name: 'test-workflow',
          conclusion: 'success',
          run_number: 1,
          run_started_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          event: 'push',
        },
      ];

      const workflowRuns2: WorkflowRun[] = [
        {
          id: 2,
          workflow_id: 789,
          name: 'test-workflow',
          conclusion: 'failure',
          run_number: 1,
          run_started_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          event: 'push',
        },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([repo1, repo2]);
      mockGitHubClient.getWorkflowRuns
        .mockResolvedValueOnce(workflowRuns1)
        .mockResolvedValueOnce(workflowRuns2);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      // Should be called for each repository
      expect(upsertPropsMock).toHaveBeenCalledTimes(2);
      expect(upsertPropsMock).toHaveBeenNthCalledWith(
        1,
        'github_repository',
        'repo1',
        expect.objectContaining({
          workflow_success_rate: 1.0,
          workflow_total_runs: 1,
          workflow_successful_runs: 1,
        })
      );
      expect(upsertPropsMock).toHaveBeenNthCalledWith(
        2,
        'github_repository',
        'repo2',
        expect.objectContaining({
          workflow_success_rate: 0.0,
          workflow_total_runs: 1,
          workflow_successful_runs: 0,
        })
      );
    });

    it('should handle workflow runs with different conclusion types', async () => {
      const testWorkflowRuns: WorkflowRun[] = [
        { ...mockWorkflowRun, id: 1, conclusion: 'success' },
        { ...mockWorkflowRun, id: 2, conclusion: 'failure' },
        { ...mockWorkflowRun, id: 3, conclusion: 'cancelled' },
        { ...mockWorkflowRun, id: 4, conclusion: 'skipped' },
        { ...mockWorkflowRun, id: 5, conclusion: 'neutral' },
        { ...mockWorkflowRun, id: 6, conclusion: 'timed_out' },
        { ...mockWorkflowRun, id: 7, conclusion: 'action_required' },
      ];

      mockGitHubClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
      mockGitHubClient.getWorkflowRuns.mockResolvedValue(testWorkflowRuns);

      const upsertPropsMock = jest.fn().mockResolvedValue({});
      mockPortClient.getInstance.mockResolvedValue({
        upsertProps: upsertPropsMock,
      });

      const orgName = 'test-org';

      await calculateWorkflowMetrics(mockGitHubClient, mockPortClient.getInstance(), orgName);

      // Should count only success/failure as total runs, exclude others
      expect(upsertPropsMock).toHaveBeenCalledWith(
        'github_repository',
        'test-repo',
        expect.objectContaining({
          workflow_success_rate: 0.5, // 1 success out of 2 total (success + failure)
          workflow_total_runs: 2,
          workflow_successful_runs: 1,
        })
      );
    });
  });
}); 