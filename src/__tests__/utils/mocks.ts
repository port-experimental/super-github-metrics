import { jest } from '@jest/globals';
import type { 
  Repository, 
  PullRequestBasic, 
  PullRequest, 
  PullRequestReview, 
  Commit, 
  WorkflowRun,
  AuditLogEntry,
  GitHubUser
} from '../../types/github';
import type { PortEntity, PortEntitiesResponse, PortEntityResponse } from '../../types/port';
import { createGitHubClient } from '../../clients/github';

// Mock GitHub API responses
export const mockRepository: Repository = {
  id: 123456,
  name: 'test-repo',
  owner: {
    login: 'test-owner',
  },
  default_branch: 'main',
};

export const mockPullRequestBasic: PullRequestBasic = {
  id: 789,
  number: 1,
  created_at: '2024-01-01T10:00:00Z',
  closed_at: '2024-01-02T10:00:00Z',
  merged_at: '2024-01-02T10:00:00Z',
  user: {
    login: 'test-user',
  },
};

export const mockPullRequest: PullRequest = {
  ...mockPullRequestBasic,
  additions: 100,
  deletions: 50,
  changed_files: 5,
  comments: 3,
  review_comments: 2,
};

export const mockPullRequestReview: PullRequestReview = {
  id: 456,
  state: 'APPROVED',
  submitted_at: '2024-01-01T15:00:00Z',
  user: {
    login: 'reviewer',
  },
};

export const mockCommit: Commit = {
  commit: {
    author: {
      date: '2024-01-01T12:00:00Z',
    },
  },
  author: {
    login: 'test-user',
  },
  stats: {
    total: 150,
  },
};

export const mockWorkflowRun: WorkflowRun = {
  id: 123,
  workflow_id: 456,
  name: 'test-workflow',
  conclusion: 'success',
  run_number: 1,
  run_started_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-01T10:05:00Z',
  event: 'push',
};

export const mockAuditLogEntry: AuditLogEntry = {
  user: 'test-user',
  user_id: 123,
  created_at: '2024-01-01T00:00:00Z',
  org_id: 177709801,
};

export const mockGitHubUser: GitHubUser = {
  identifier: 'test-user',
  title: 'Test User',
  properties: {
    join_date: '2024-01-01T00:00:00Z',
  },
};

export const mockPortEntity: PortEntity = {
  identifier: 'test-user',
  title: 'Test User',
  properties: {
    join_date: '2024-01-01T00:00:00Z',
  },
};

export const mockPortEntitiesResponse: PortEntitiesResponse = {
  entities: [mockPortEntity],
  ok: true,
};

export const mockPortEntityResponse: PortEntityResponse = {
  entity: mockPortEntity,
  ok: true,
};

// Mock GitHub Client with proper typing
export const createMockGitHubClient: jest.MockedFunction<ReturnType<typeof createGitHubClient>> = () => {
  const mockClient = {
    checkRateLimits: jest.fn(),
    getRateLimitStatus: jest.fn(),
    fetchOrganizationRepositories: jest.fn(),
    getPullRequests: jest.fn(),
    getPullRequest: jest.fn(),
    getPullRequestReviews: jest.fn(),
    getPullRequestCommits: jest.fn(),
    getRepositoryCommits: jest.fn(),
    getWorkflowRuns: jest.fn(),
    getMemberAddDates: jest.fn(),
    searchCommits: jest.fn(),
    searchPullRequests: jest.fn(),
    searchReviews: jest.fn(),
    getIssues: jest.fn(),
    getIssueComments: jest.fn(),
    makeRequestWithRetry: jest.fn(),
    addRequestDelay: jest.fn(),
  };

  // Set default return values
  (mockClient.checkRateLimits as any).mockResolvedValue(undefined);
  (mockClient.getRateLimitStatus as any).mockResolvedValue({
    remaining: 5000,
    limit: 5000,
    resetTime: new Date(Date.now() + 3600000),
    secondsUntilReset: 3600,
  });
  (mockClient.fetchOrganizationRepositories as any).mockResolvedValue([mockRepository]);
  (mockClient.getPullRequests as any).mockResolvedValue([mockPullRequestBasic]);
  (mockClient.getPullRequest as any).mockResolvedValue(mockPullRequest);
  (mockClient.getPullRequestReviews as any).mockResolvedValue([mockPullRequestReview]);
  (mockClient.getPullRequestCommits as any).mockResolvedValue([mockCommit]);
  (mockClient.getRepositoryCommits as any).mockResolvedValue([mockCommit]);
  (mockClient.getWorkflowRuns as any).mockResolvedValue([mockWorkflowRun]);
  (mockClient.getMemberAddDates as any).mockResolvedValue([mockAuditLogEntry]);
  (mockClient.searchCommits as any).mockResolvedValue([mockCommit]);
  (mockClient.searchPullRequests as any).mockResolvedValue([mockPullRequestBasic]);
  (mockClient.searchReviews as any).mockResolvedValue([mockPullRequestReview]);
  (mockClient.getIssues as any).mockResolvedValue([]);
  (mockClient.getIssueComments as any).mockResolvedValue([]);
  (mockClient.makeRequestWithRetry as any).mockImplementation((fn: any) => fn());
  (mockClient.addRequestDelay as any).mockResolvedValue(undefined);

  return mockClient;
};

// Mock Port Client with proper typing
export const createMockPortClient = () => {
  const mockInstance = {
    getEntities: jest.fn(),
    getEntity: jest.fn(),
    upsertProps: jest.fn(),
    upsertEntity: jest.fn(),
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    deleteAllEntities: jest.fn(),
    getUsers: jest.fn(),
    getUser: jest.fn(),
    getTokenInfo: jest.fn(),
  };

  // Set default return values
  (mockInstance.getEntities as any).mockResolvedValue(mockPortEntitiesResponse);
  (mockInstance.getEntity as any).mockResolvedValue(mockPortEntityResponse);
  (mockInstance.upsertProps as any).mockResolvedValue({});
  (mockInstance.upsertEntity as any).mockResolvedValue({});
  (mockInstance.createEntity as any).mockResolvedValue({});
  (mockInstance.updateEntity as any).mockResolvedValue(mockPortEntity);
  (mockInstance.deleteAllEntities as any).mockResolvedValue(undefined);
  (mockInstance.getUsers as any).mockResolvedValue(mockPortEntitiesResponse);
  (mockInstance.getUser as any).mockResolvedValue(mockPortEntityResponse);
  (mockInstance.getTokenInfo as any).mockReturnValue({
    hasToken: true,
    expiresAt: new Date(Date.now() + 3600000),
    isExpired: false,
  });

  return {
    getInstance: (jest.fn() as any).mockResolvedValue(mockInstance),
    ...mockInstance,
  };
};

// Mock axios with simplified typing
export const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn(),
};

// Mock Octokit with simplified typing
export const mockOctokit = {
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
  pulls: {
    listCommits: jest.fn(),
  },
}; 