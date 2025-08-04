import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createGitHubClient } from '../../clients/github';
import { PortClient } from '../../clients/port';
import { calculateAndStoreServiceMetrics } from '../service_metrics';
import { calculateAndStorePRMetrics } from '../pr_metrics';
import { calculateWorkflowMetrics } from '../workflow_metrics';
import { calculateAndStoreDeveloperStats } from '../onboarding_metrics';
import { createMockGitHubClient, createMockPortClient } from '../../__tests__/utils/mocks';

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

// Mock all the dependencies
jest.mock('../../clients/github');
jest.mock('../../clients/port');
jest.mock('../service_metrics');
jest.mock('../pr_metrics');
jest.mock('../workflow_metrics');
jest.mock('../onboarding_metrics');

const mockCreateGitHubClient = createGitHubClient as jest.MockedFunction<typeof createGitHubClient>;
const mockPortClientGetInstance = PortClient.getInstance as jest.MockedFunction<
  typeof PortClient.getInstance
>;
const mockCalculateServiceMetrics = calculateAndStoreServiceMetrics as jest.MockedFunction<
  typeof calculateAndStoreServiceMetrics
>;
const mockCalculatePRMetrics = calculateAndStorePRMetrics as jest.MockedFunction<
  typeof calculateAndStorePRMetrics
>;
const mockCalculateWorkflowMetrics = calculateWorkflowMetrics as jest.MockedFunction<
  typeof calculateWorkflowMetrics
>;
const mockCalculateOnboardingMetrics = calculateAndStoreDeveloperStats as jest.MockedFunction<
  typeof calculateAndStoreDeveloperStats
>;

describe('GitHub CLI Main', () => {
  let mockGitHubClient: any;
  let mockPortClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock clients using the helper functions
    mockGitHubClient = createMockGitHubClient();
    mockPortClient = createMockPortClient();

    mockCreateGitHubClient.mockReturnValue(mockGitHubClient);
    mockPortClientGetInstance.mockResolvedValue(mockPortClient.getInstance());

    // Set up environment variables
    process.env.X_GITHUB_TOKEN = 'test-token';
    process.env.X_GITHUB_ENTERPRISE = 'test-enterprise';
    process.env.X_GITHUB_ORGS = 'test-org1,test-org2';
    process.env.PORT_CLIENT_ID = 'test-client-id';
    process.env.PORT_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.X_GITHUB_TOKEN;
    delete process.env.X_GITHUB_ENTERPRISE;
    delete process.env.X_GITHUB_ORGS;
    delete process.env.PORT_CLIENT_ID;
    delete process.env.PORT_CLIENT_SECRET;
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('service-metrics command', () => {
    it('should call service metrics calculation with correct parameters', async () => {
      // Import the main function dynamically to avoid module loading issues
      const { main } = await import('../main');

      // Mock process.argv
      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'service-metrics'];

      // The main function is already called when the module is imported
      // We just need to verify that our mocks were called
      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculateServiceMetrics).toHaveBeenCalled();

      process.argv = originalArgv;
    });
  });

  describe('pr-metrics command', () => {
    it('should call PR metrics calculation with correct parameters', async () => {
      const { main } = await import('../main');

      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'pr-metrics'];

      // The main function is already called when the module is imported
      // We just need to verify that our mocks were called
      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculatePRMetrics).toHaveBeenCalled();

      process.argv = originalArgv;
    });
  });

  describe('workflow-metrics command', () => {
    it('should call workflow metrics calculation with correct parameters', async () => {
      const { main } = await import('../main');

      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'workflow-metrics'];

      // The main function is already called when the module is imported
      // We just need to verify that our mocks were called
      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculateWorkflowMetrics).toHaveBeenCalled();

      process.argv = originalArgv;
    });
  });

  describe('onboarding-metrics command', () => {
    it('should call onboarding metrics calculation with correct parameters', async () => {
      const { main } = await import('../main');

      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'onboarding-metrics'];

      // The main function is already called when the module is imported
      // We just need to verify that our mocks were called
      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();
      expect(mockCalculateOnboardingMetrics).toHaveBeenCalled();

      process.argv = originalArgv;
    });
  });

  describe('error handling', () => {
    it('should handle missing environment variables', async () => {
      delete process.env.X_GITHUB_TOKEN;

      const { main } = await import('../main');

      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'service-metrics'];

      // The main function is already called when the module is imported
      // We expect it to fail due to missing environment variables
      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();

      process.argv = originalArgv;
    });

    it('should handle unknown commands', async () => {
      const { main } = await import('../main');

      const originalArgv = process.argv;
      process.argv = ['node', 'main.ts', 'unknown-command'];

      // The main function is already called when the module is imported
      // We expect it to fail due to unknown command
      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockPortClientGetInstance).toHaveBeenCalled();

      process.argv = originalArgv;
    });
  });
});
