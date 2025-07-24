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
  user?: {
    login: string;
  } | null;
  reviews?: GitHubReview[];
}

export interface GitHubReview {
  user?: {
    login: string;
  } | null;
  submitted_at?: string;
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

export interface Repository {
  id: number;
  name: string;
  owner: {
    login: string;
  };
  default_branch?: string;
}

export interface PullRequestBasic {
  id: number;
  number: number;
  created_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  user?: {
    login: string;
  } | null;
}

export interface PullRequest extends PullRequestBasic {
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
  review_comments: number;
}

export interface PullRequestReview {
  id: number;
  state: string;
  submitted_at?: string;
  user?: {
    login: string;
  } | null;
}

export interface Commit {
  commit: {
    author?: {
      date?: string;
      name?: string;
    } | null;
  };
  author?: {
    login?: string;
  } | null;
  stats?: {
    total?: number;
  };
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  name?: string | null;
  conclusion?: string | null;
  run_number: number;
  run_started_at?: string | null;
  updated_at?: string | null;
  event: string;
}

export interface SearchResult<T> {
  items: T[];
}

export interface AuditLogEntry {
  user: string;
  user_id: number;
  created_at: string;
  org: string;
}

export interface TimeSeriesMetrics {
  period: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  totalPRs: number;
  totalMergedPRs: number;
  numberOfPRsReviewed: number;
  numberOfPRsMergedWithoutReview: number;
  percentageOfPRsReviewed: number;
  percentageOfPRsMergedWithoutReview: number;
  averageTimeToFirstReview: number;
  prSuccessRate: number;
  contributionStandardDeviation: number;
}

export interface ServiceMetricsEntity {
  identifier: string;
  title: string;
  properties: {
    period: string;
    period_type: 'daily' | 'weekly' | 'monthly';
    total_prs: number;
    total_merged_prs: number;
    number_of_prs_reviewed: number;
    number_of_prs_merged_without_review: number;
    percentage_of_prs_reviewed: number;
    percentage_of_prs_merged_without_review: number;
    average_time_to_first_review: number;
    pr_success_rate: number;
    contribution_standard_deviation: number;
    calculated_at: string;
    data_source: string;
  };
  relations: {
    service: string; // Service entity identifier
  };
  [key: string]: unknown; // Index signature to match PortEntity interface
} 