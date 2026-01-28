import { jest } from '@jest/globals';
import type {
  Repository,
  PullRequestBasic,
  PullRequest,
  PullRequestReview,
  Commit,
  WorkflowRun,
  AuditLogEntry,
  GitHubUser,
} from '../../clients/github/types';
import type { PortEntity, PortEntitiesResponse, PortEntityResponse } from '../../clients/port/types';
import { createGitHubClient } from '../../clients/github';

// Mock axios with simplified typing - moved to top to fix import order
export const mockAxios: any = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn(),
};

// Mock Octokit with simplified typing
export const mockOctokit: any = {
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
  org: 'test-org',
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
export const createMockGitHubClient = (): any => {
  const mockClient = {
    checkRateLimits: jest.fn<() => Promise<void>>(),
    getRateLimitStatus:
      jest.fn<
        () => Promise<{
          remaining: number;
          limit: number;
          resetTime: Date;
          secondsUntilReset: number;
        }>
      >(),
    fetchOrganizationRepositories: jest.fn<() => Promise<Repository[]>>(),
    getPullRequests: jest.fn<() => Promise<PullRequestBasic[]>>(),
    getPullRequest: jest.fn<() => Promise<PullRequest>>(),
    getPullRequestReviews: jest.fn<() => Promise<PullRequestReview[]>>(),
    getPullRequestCommits: jest.fn<() => Promise<Commit[]>>(),
    getRepositoryCommits: jest.fn<() => Promise<Commit[]>>(),
    getWorkflowRuns: jest.fn<() => Promise<WorkflowRun[]>>(),
    getMemberAddDates: jest.fn<() => Promise<AuditLogEntry[]>>(),
    searchCommits: jest.fn<() => Promise<Commit[]>>(),
    searchPullRequests: jest.fn<() => Promise<PullRequestBasic[]>>(),
    searchReviews: jest.fn<() => Promise<PullRequestReview[]>>(),
    getIssues: jest.fn<() => Promise<any[]>>(),
    getIssueComments: jest.fn<() => Promise<any[]>>(),
    makeRequestWithRetry: jest.fn<(fn: () => Promise<any>) => Promise<any>>(),
    addRequestDelay: jest.fn<() => Promise<void>>(),
  };

  // Set default return values
  mockClient.checkRateLimits.mockResolvedValue(undefined);
  mockClient.getRateLimitStatus.mockResolvedValue({
    remaining: 5000,
    limit: 5000,
    resetTime: new Date(Date.now() + 3600000),
    secondsUntilReset: 3600,
  });
  mockClient.fetchOrganizationRepositories.mockResolvedValue([mockRepository]);
  mockClient.getPullRequests.mockResolvedValue([mockPullRequestBasic]);
  mockClient.getPullRequest.mockResolvedValue(mockPullRequest);
  mockClient.getPullRequestReviews.mockResolvedValue([mockPullRequestReview]);
  mockClient.getPullRequestCommits.mockResolvedValue([mockCommit]);
  mockClient.getRepositoryCommits.mockResolvedValue([mockCommit]);
  mockClient.getWorkflowRuns.mockResolvedValue([mockWorkflowRun]);
  mockClient.getMemberAddDates.mockResolvedValue([mockAuditLogEntry]);
  mockClient.searchCommits.mockResolvedValue([mockCommit]);
  mockClient.searchPullRequests.mockResolvedValue([mockPullRequestBasic]);
  mockClient.searchReviews.mockResolvedValue([mockPullRequestReview]);
  mockClient.getIssues.mockResolvedValue([]);
  mockClient.getIssueComments.mockResolvedValue([]);
  mockClient.makeRequestWithRetry.mockImplementation((fn: any) => fn());
  mockClient.addRequestDelay.mockResolvedValue(undefined);

  return mockClient;
};

// Mock Port Client with proper typing
export const createMockPortClient = (): any => {
  const mockInstance = {
    getEntities: jest.fn<() => Promise<PortEntitiesResponse>>(),
    getEntity: jest.fn<() => Promise<PortEntityResponse>>(),
    upsertProps: jest.fn<() => Promise<any>>(),
    upsertEntity: jest.fn<() => Promise<any>>(),
    createEntity: jest.fn<() => Promise<any>>(),
    updateEntity: jest.fn<() => Promise<PortEntity>>(),
    deleteAllEntities: jest.fn<() => Promise<void>>(),
    getUsers: jest.fn<() => Promise<PortEntitiesResponse>>(),
    getUser: jest.fn<() => Promise<PortEntityResponse>>(),
    getTokenInfo: jest.fn<() => { hasToken: boolean; expiresAt: Date; isExpired: boolean }>(),
  };

  // Set default return values
  mockInstance.getEntities.mockResolvedValue(mockPortEntitiesResponse);
  mockInstance.getEntity.mockResolvedValue(mockPortEntityResponse);
  mockInstance.upsertProps.mockResolvedValue({});
  mockInstance.upsertEntity.mockResolvedValue({});
  mockInstance.createEntity.mockResolvedValue({});
  mockInstance.updateEntity.mockResolvedValue(mockPortEntity);
  mockInstance.deleteAllEntities.mockResolvedValue(undefined);
  mockInstance.getUsers.mockResolvedValue(mockPortEntitiesResponse);
  mockInstance.getUser.mockResolvedValue(mockPortEntityResponse);
  mockInstance.getTokenInfo.mockReturnValue({
    hasToken: true,
    expiresAt: new Date(Date.now() + 3600000),
    isExpired: false,
  });

  return {
    getInstance: jest.fn<() => Promise<typeof mockInstance>>().mockResolvedValue(mockInstance),
    ...mockInstance,
  };
};
