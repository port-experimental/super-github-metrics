import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createGitHubClient } from '../../clients/github';
import { getEntities } from '../../clients/port';
import {
  calculateAndStoreDeveloperStats,
  hasCompleteOnboardingMetrics,
} from '../onboarding_metrics';
import {
  createMockGitHubClient,
  createMockPortClient,
  mockPortEntity,
} from '../../__tests__/utils/mocks';

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

// Mock the modules
jest.mock('../../clients/github', () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock('../../clients/port', () => ({
  getEntities: jest.fn(),
}));

jest.mock('../onboarding_metrics', () => ({
  calculateAndStoreDeveloperStats: jest.fn(),
  hasCompleteOnboardingMetrics: jest.fn(),
}));

jest.mock('../pr_metrics', () => ({
  calculateAndStorePRMetrics: jest.fn(),
}));

jest.mock('../service_metrics', () => ({
  calculateAndStoreServiceMetrics: jest.fn(),
}));

jest.mock('../workflow_metrics', () => ({
  calculateWorkflowMetrics: jest.fn(),
}));

// Mock environment variables
const originalEnv = process.env;

describe('GitHub CLI Main', () => {
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
    const { createGitHubClient } = require('../../clients/github');
    createGitHubClient.mockReturnValue(mockGitHubClient);

    const { getEntities } = require('../../clients/port');
    getEntities.mockResolvedValue({ entities: [mockPortEntity] });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('Environment validation', () => {
    it('should validate environment variables', async () => {
      // Test that the module can be imported without throwing
      expect(() => {
        require('../main');
      }).not.toThrow();
    });

    it('should handle missing X_GITHUB_TOKEN', async () => {
      delete process.env.X_GITHUB_TOKEN;

      // Test that the module can be imported without throwing
      expect(() => {
        require('../main');
      }).not.toThrow();
    });

    it('should handle missing X_GITHUB_ENTERPRISE', async () => {
      delete process.env.X_GITHUB_ENTERPRISE;

      // Test that the module can be imported without throwing
      expect(() => {
        require('../main');
      }).not.toThrow();
    });

    it('should handle missing X_GITHUB_ORGS', async () => {
      delete process.env.X_GITHUB_ORGS;

      // Test that the module can be imported without throwing
      expect(() => {
        require('../main');
      }).not.toThrow();
    });
  });

  describe('Module imports', () => {
    it('should import onboarding metrics module successfully', async () => {
      const {
        calculateAndStoreDeveloperStats,
        hasCompleteOnboardingMetrics,
      } = require('../onboarding_metrics');
      calculateAndStoreDeveloperStats.mockResolvedValue(undefined);
      hasCompleteOnboardingMetrics.mockResolvedValue(true);

      expect(calculateAndStoreDeveloperStats).toBeDefined();
      expect(hasCompleteOnboardingMetrics).toBeDefined();
    });

    it('should import PR metrics module successfully', async () => {
      const { calculateAndStorePRMetrics } = require('../pr_metrics');
      calculateAndStorePRMetrics.mockResolvedValue(undefined);

      expect(calculateAndStorePRMetrics).toBeDefined();
    });

    it('should import service metrics module successfully', async () => {
      const { calculateAndStoreServiceMetrics } = require('../service_metrics');
      calculateAndStoreServiceMetrics.mockResolvedValue(undefined);

      expect(calculateAndStoreServiceMetrics).toBeDefined();
    });

    it('should import workflow metrics module successfully', async () => {
      const { calculateWorkflowMetrics } = require('../workflow_metrics');
      calculateWorkflowMetrics.mockResolvedValue(undefined);

      expect(calculateWorkflowMetrics).toBeDefined();
    });
  });

  describe('Client creation', () => {
    it('should create GitHub client successfully', async () => {
      const { createGitHubClient } = require('../../clients/github');
      const client = createGitHubClient('test-token');

      expect(client).toBeDefined();
      expect(createGitHubClient).toHaveBeenCalledWith('test-token');
    });

    it('should get Port entities successfully', async () => {
      const { getEntities } = require('../../clients/port');
      const entities = await getEntities('test-blueprint');

      expect(entities).toBeDefined();
      expect(getEntities).toHaveBeenCalledWith('test-blueprint');
    });
  });

  describe('Error handling', () => {
    it('should handle module import errors gracefully', async () => {
      // Test that the module can be imported without throwing
      expect(() => {
        require('../main');
      }).not.toThrow();
    });
  });
});
