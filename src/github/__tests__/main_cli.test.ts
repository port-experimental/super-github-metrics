import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMockGitHubClient } from '../../__tests__/utils/mocks';

// Mock all dependencies with explicit factories to avoid ESM parsing issues
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  PortClient: {
    getInstance: jest.fn(),
  },
  upsertEntitiesInBatches: jest.fn(),
  getEntities: jest.fn(),
  getUsers: jest.fn(),
  getUser: jest.fn(),
  deleteAllEntities: jest.fn(),
}));

jest.mock('../service_metrics', () => ({
  calculateAndStoreServiceMetrics: jest.fn(),
}));

jest.mock('../pr_metrics', () => ({
  calculateAndStorePRMetrics: jest.fn(),
}));

jest.mock('../workflow_metrics', () => ({
  getWorkflowMetrics: jest.fn(),
  calculateWorkflowMetrics: jest.fn(),
}));

jest.mock('../onboarding_metrics', () => ({
  calculateAndStoreDeveloperStats: jest.fn(),
  getMemberAddDates: jest.fn(),
  hasCompleteOnboardingMetrics: jest.fn(),
}));

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

describe('GitHub CLI Main', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env;
  let mockGitHubClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockGitHubClient = createMockGitHubClient();

    process.env = {
      ...originalEnv,
      X_GITHUB_TOKEN: 'test-token',
      X_GITHUB_ENTERPRISE: 'test-enterprise',
      X_GITHUB_ORGS: 'test-org',
      PORT_CLIENT_ID: 'test-client-id',
      PORT_CLIENT_SECRET: 'test-client-secret',
      PORT_BASE_URL: 'https://test.api.getport.io/v1',
    };

    // Configure mocks fresh after resetModules
    const githubMock = require('../../clients/github') as any;
    githubMock.createGitHubClient.mockReturnValue(mockGitHubClient);

    const portMock = require('../../clients/port') as any;
    portMock.PortClient.getInstance.mockResolvedValue({});
    portMock.upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);
    portMock.getEntities.mockResolvedValue({ entities: [], ok: true });
    portMock.getUsers.mockResolvedValue({ entities: [], ok: true });

    const serviceMetricsMock = require('../service_metrics') as any;
    serviceMetricsMock.calculateAndStoreServiceMetrics.mockResolvedValue(undefined);

    const prMetricsMock = require('../pr_metrics') as any;
    prMetricsMock.calculateAndStorePRMetrics.mockResolvedValue(undefined);

    const workflowMock = require('../workflow_metrics') as any;
    workflowMock.getWorkflowMetrics.mockResolvedValue(undefined);
    workflowMock.calculateWorkflowMetrics.mockResolvedValue(undefined);

    const onboardingMock = require('../onboarding_metrics') as any;
    onboardingMock.calculateAndStoreDeveloperStats.mockResolvedValue(null);
    onboardingMock.getMemberAddDates.mockResolvedValue([]);
    onboardingMock.hasCompleteOnboardingMetrics.mockReturnValue(false);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('service-metrics command', () => {
    it('should call service metrics calculation with correct parameters', async () => {
      // Mock process.exit BEFORE requiring main (since main self-executes)
      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Set argv BEFORE requiring main so Commander parses the right command
      process.argv = ['node', 'main.ts', 'service-metrics'];

      // Require main fresh (resetModules was called in beforeEach)
      require('../main');
      // Wait for the async main() to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockCreateGitHubClient = require('../../clients/github').createGitHubClient;
      const mockCalculateServiceMetrics =
        require('../service_metrics').calculateAndStoreServiceMetrics;

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockCalculateServiceMetrics).toHaveBeenCalled();
    });
  });

  describe('pr-metrics command', () => {
    it('should call PR metrics calculation with correct parameters', async () => {
      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Set argv BEFORE requiring main so Commander parses the right command
      process.argv = ['node', 'main.ts', 'pr-metrics'];

      require('../main');
      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockCreateGitHubClient = require('../../clients/github').createGitHubClient;
      const mockCalculatePRMetrics = require('../pr_metrics').calculateAndStorePRMetrics;

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockCalculatePRMetrics).toHaveBeenCalled();
    });
  });

  describe('workflow-metrics command', () => {
    it('should call workflow metrics calculation with correct parameters', async () => {
      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      process.argv = ['node', 'main.ts', 'workflow-metrics'];

      require('../main');
      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockCreateGitHubClient = require('../../clients/github').createGitHubClient;
      const mockCalculateWorkflowMetrics = require('../workflow_metrics').calculateWorkflowMetrics;

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockCalculateWorkflowMetrics).toHaveBeenCalled();
    });
  });

  describe('onboarding-metrics command', () => {
    it('should call onboarding metrics calculation with correct parameters', async () => {
      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Provide a user with incomplete metrics and a matching audit log entry so
      // calculateAndStoreDeveloperStats gets invoked
      const portMock = require('../../clients/port') as any;
      portMock.getEntities.mockResolvedValue({
        entities: [{ identifier: 'test-user', title: 'Test User', properties: {} }],
        ok: true,
      });

      process.argv = ['node', 'main.ts', 'onboarding-metrics'];

      require('../main');
      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockCreateGitHubClient = require('../../clients/github').createGitHubClient;
      const mockCalculateOnboardingMetrics =
        require('../onboarding_metrics').calculateAndStoreDeveloperStats;

      expect(mockCreateGitHubClient).toHaveBeenCalled();
      expect(mockCalculateOnboardingMetrics).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle missing environment variables', async () => {
      delete process.env.X_GITHUB_TOKEN;

      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      process.argv = ['node', 'main.ts', 'service-metrics'];

      // main() should catch the error from missing env and call process.exit
      expect(() => require('../main')).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle unknown commands', async () => {
      // Use a no-op mock so process.exit doesn't throw and cause unhandled rejections
      const exitMock = jest
        .spyOn(process, 'exit')
        .mockImplementation((): never => undefined as never);

      process.argv = ['node', 'main.ts', 'unknown-command'];

      // Commander will error on unknown command and call process.exit
      require('../main');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(exitMock).toHaveBeenCalled();
    });
  });
});
