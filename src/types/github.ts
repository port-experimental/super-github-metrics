export interface GitHubUser {
  identifier: string;
  title?: string;
  properties: {
    join_date?: string;
    first_commit?: string;
    first_pr?: string;
    tenth_commit?: string;
    tenth_pr?: string;
    [key: string]: unknown;
  };
  relations?: Record<string, unknown>;
}

export interface GitHubCommit {
  commit: {
    author?: {
      date?: string;
    } | null;
  };
  stats?: {
    total?: number;
  } | null;
}

export interface GitHubPullRequest {
  number: number;
  created_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  user: {
    login: string;
  };
  reviews?: GitHubReview[];
}

export interface GitHubReview {
  user: {
    login: string;
  };
  submitted_at: string;
  created_at?: string;
}

export interface GitHubRepository {
  name: string;
  owner: {
    login: string;
  };
  full_name: string;
  default_branch: string;
}

export interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  head_branch: string;
}

export interface DeveloperStats {
  login: string;
  joinDate?: string;
  firstCommit?: string;
  firstPR?: string;
  tenthCommit?: string;
  tenthPR?: string;
}

export interface MemberJoinRecord {
  user: string;
  created_at: string;
}

export interface RepositoryWorkflowMetrics {
  repository: string;
  workflowName: string;
  successRate: number;
  averageDuration: number;
  totalRuns: number;
  lastRunStatus: string;
  lastRunDate: string;
}
