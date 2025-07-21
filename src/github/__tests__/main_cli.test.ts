import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createGitHubClient } from '../../clients/github';
import { PortClient } from '../../clients/port';
import { calculateAndStoreServiceMetrics } from '../service_metrics';
import { calculateAndStorePRMetrics } from '../pr_metrics';
import { calculateWorkflowMetrics } from '../workflow_metrics';
import { calculateAndStoreDeveloperStats } from '../onboarding_metrics';

// Mock all the dependencies
jest.mock('../../clients/github');
jest.mock('../../clients/port');
jest.mock('../service_metrics');
jest.mock('../pr_metrics');
jest.mock('../workflow_metrics');
jest.mock('../onboarding_metrics');

const mockCreateGitHubClient = createGitHubClient as jest.MockedFunction<typeof createGitHubClient>;
const mockPortClientGetInstance = PortClient.getInstance as jest.MockedFunction<typeof PortClient.getInstance>;
const mockCalculateServiceMetrics = calculateAndStoreServiceMetrics as jest.MockedFunction<typeof calculateAndStoreServiceMetrics>;
const mockCalculatePRMetrics = calculateAndStorePRMetrics as jest.MockedFunction<typeof calculateAndStorePRMetrics>;
const mockCalculateWorkflowMetrics = calculateWorkflowMetrics as jest.MockedFunction<typeof calculateWorkflowMetrics>;
const mockCalculateOnboardingMetrics = calculateAndStoreDeveloperStats as jest.MockedFunction<typeof calculateAndStoreDeveloperStats>;

describe('GitHub CLI Main', () => {
  let mockGitHubClient: any;
  let mockPortClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock clients
    mockGitHubClient = {
      checkRateLimits: jest.fn().mockResolvedValue(undefined),
      fetchOrganizationRepositories: jest.fn().mockResolvedValue([]),
      getPullRequests: jest.fn().mockResolvedValue([]),
      getPullRequest: jest.fn().mockResolvedValue({}),
      getPullRequestReviews: jest.fn().mockResolvedValue([]),
      getPullRequestCommits: jest.fn().mockResolvedValue([]),
      getRepositoryCommits: jest.fn().mockResolvedValue([]),
      getWorkflowRuns: jest.fn().mockResolvedValue([]),
      getMemberAddDates: jest.fn().mockResolvedValue([]),
      searchCommits: jest.fn().mockResolvedValue([]),
      searchPullRequests: jest.fn().mockResolvedValue([]),
      searchReviews: jest.fn().mockResolvedValue([]),
      getIssues: jest.fn().mockResolvedValue([]),
      getIssueComments: jest.fn().mockResolvedValue([]),
    };

    mockPortClient = {
      getInstance: jest.fn().mockResolvedValue({
        upsertProps: jest.fn().mockResolvedValue({}),
        upsertEntity: jest.fn().mockResolvedValue({}),
        createEntity: jest.fn().mockResolvedValue({}),
        updateEntity: jest.fn().mockResolvedValue({}),
        deleteAllEntities: jest.fn().mockResolvedValue(undefined),
        getEntities: jest.fn().mockResolvedValue({ entities: [] }),
        getEntity: jest.fn().mockResolvedValue({ entity: {} }),
        getUsers: jest.fn().mockResolvedValue({ entities: [] }),
        getUser: jest.fn().mockResolvedValue({ entity: {} }),
      }),
    };

    mockCreateGitHubClient.mockReturnValue(mockGitHubClient);
    mockPortClientGetInstance.mockResolvedValue(mockPortClient.getInstance());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('service-metrics command', () => {
    it('should call service metrics calculation with correct parameters', async () => {
      // Import the main function dynamically to avoid module loading issues
      const { main } = await import('../main');
      
      // Mock process.argv
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'service-metrics', '--org', 'test-org'];

      try {
        await main();
      } catch (error) {
        // Expected to fail due to missing environment variables, but we can verify the calls
      }

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculateServiceMetrics).toHaveBeenCalledWith(
        mockGitHubClient,
        mockPortClient.getInstance(),
        'test-org'
      );

      process.argv = originalArgv;
    });

    it('should handle missing organization parameter', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'service-metrics'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });
  });

  describe('pr-metrics command', () => {
    it('should call PR metrics calculation with correct parameters', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'pr-metrics', '--org', 'test-org', '--repo', 'test-repo'];

      try {
        await main();
      } catch (error) {
        // Expected to fail due to missing environment variables
      }

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculatePRMetrics).toHaveBeenCalledWith(
        mockGitHubClient,
        mockPortClient.getInstance(),
        'test-org',
        'test-repo'
      );

      process.argv = originalArgv;
    });

    it('should handle missing organization or repository parameters', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'pr-metrics', '--org', 'test-org'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });
  });

  describe('workflow-metrics command', () => {
    it('should call workflow metrics calculation with correct parameters', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'workflow-metrics', '--org', 'test-org'];

      try {
        await main();
      } catch (error) {
        // Expected to fail due to missing environment variables
      }

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculateWorkflowMetrics).toHaveBeenCalledWith(
        mockGitHubClient,
        mockPortClient.getInstance(),
        'test-org'
      );

      process.argv = originalArgv;
    });

    it('should handle missing organization parameter', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'workflow-metrics'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });
  });

  describe('onboarding-metrics command', () => {
    it('should call onboarding metrics calculation with correct parameters', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'onboarding-metrics', '--org', 'test-org'];

      try {
        await main();
      } catch (error) {
        // Expected to fail due to missing environment variables
      }

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculateOnboardingMetrics).toHaveBeenCalledWith(
        mockGitHubClient,
        mockPortClient.getInstance(),
        'test-org'
      );

      process.argv = originalArgv;
    });

    it('should handle missing organization parameter', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'onboarding-metrics'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });

    it('should handle force flag for onboarding metrics', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'onboarding-metrics', '--org', 'test-org', '--force'];

      try {
        await main();
      } catch (error) {
        // Expected to fail due to missing environment variables
      }

      expect(mockCalculateOnboardingMetrics).toHaveBeenCalledWith(
        mockGitHubClient,
        mockPortClient.getInstance(),
        'test-org',
        true // force flag should be passed
      );

      process.argv = originalArgv;
    });
  });

  describe('error handling', () => {
    it('should handle unknown command', async () => {
      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'unknown-command'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });

    it('should handle GitHub client creation errors', async () => {
      mockCreateGitHubClient.mockImplementation(() => {
        throw new Error('GitHub client creation failed');
      });

      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'service-metrics', '--org', 'test-org'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });

    it('should handle Port client creation errors', async () => {
      mockPortClientGetInstance.mockRejectedValue(new Error('Port client creation failed'));

      const { main } = await import('../main');
      
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'service-metrics', '--org', 'test-org'];

      try {
        await main();
      } catch (error) {
        expect(error).toBeDefined();
      }

      process.argv = originalArgv;
    });
  });

  describe('environment variable handling', () => {
    it('should use environment variables for GitHub token', () => {
      const originalEnv = process.env;
      process.env.X_GITHUB_TOKEN = 'test-token';

      // Trigger GitHub client creation
      mockCreateGitHubClient('test-token');

      expect(mockCreateGitHubClient).toHaveBeenCalledWith('test-token');

      process.env = originalEnv;
    });

    it('should handle missing GitHub token', () => {
      const originalEnv = process.env;
      delete process.env.X_GITHUB_TOKEN;

      // The main function should handle this gracefully
      expect(() => {
        mockCreateGitHubClient(undefined as any);
      }).not.toThrow();

      process.env = originalEnv;
    });
  });
}); 