// Test setup file
import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.PORT_CLIENT_ID = 'test-client-id';
process.env.PORT_CLIENT_SECRET = 'test-client-secret';
process.env.X_GITHUB_TOKEN = 'test-github-token';
process.env.X_GITHUB_ENTERPRISE = 'test-enterprise';
process.env.X_GITHUB_ORGS = 'test-org1,test-org2';

// Mock problematic ES modules
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      pulls: {
        list: jest.fn(),
        get: jest.fn(),
        listReviews: jest.fn(),
      },
      repos: {
        listCommits: jest.fn(),
        listForOrg: jest.fn(),
      },
      rateLimit: {
        get: jest.fn(),
      },
    },
    paginate: jest.fn(),
    request: jest.fn(),
    search: {
      issuesAndPullRequests: jest.fn(),
    },
  })),
}));

// Global test timeout
jest.setTimeout(30000);

// Suppress console.log during tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore console output
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Helper function to restore console for specific tests
export const enableConsoleOutput = () => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
};

// Helper function to suppress console for specific tests
export const suppressConsoleOutput = () => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
}; 