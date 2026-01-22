import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import type { Logger } from "pino";
import type {
  AuditLogEntry,
  Commit,
  PullRequest,
  PullRequestBasic,
  PullRequestReview,
  Repository,
  WorkflowRun,
  GitHubAuthConfig,
} from "./types";
import { GitHubAuth, PATAuth, createGitHubAuth } from "./auth";

export interface AuditLogParams {
  phrase: string;
  include?: "web" | "git" | "all";
  order?: "asc" | "desc";
  per_page?: number;
}

export class GitHubClient {
  private octokit: Octokit | null = null;
  private auth: GitHubAuth;
  private logger: Logger;
  private enterpriseName?: string;

  constructor(auth: GitHubAuth, logger: Logger, enterpriseName?: string) {
    this.auth = auth;
    this.logger = logger;
    this.enterpriseName = enterpriseName;
  }

  private async ensureValidOctokit(): Promise<void> {
    if (!this.octokit || !this.auth.isTokenValid()) {
      this.octokit = await this.auth.getOctokit();
    }
  }

  /**
   * Makes a request by delegating to the auth class
   */
  private async makeRequest<T>(
    requestFn: (octokit: Octokit) => Promise<T>,
  ): Promise<T> {
    return this.auth.makeRequest(requestFn, this.logger);
  }

  /**
   * Check rate limits and log status - delegates to auth class
   */
  async checkRateLimits(): Promise<void> {
    try {
      if (this.auth instanceof PATAuth) {
        // PAT auth has special logging for multiple tokens
        await this.makeRequest(async (octokit) => {
          return octokit.rest.rateLimit.get();
        });

        const tokenStatus = this.auth.getRateLimitStatus();
        this.logger.info(`\n=== PAT Token Rate Limit Status ===`);
        this.logger.info(
          { tokenCount: this.auth.getTokenCount() },
          `Total tokens available: ${this.auth.getTokenCount()}`,
        );
        tokenStatus.forEach((status, index) => {
          this.logger.info(
            {
              tokenIndex: index + 1,
              token: status.token,
              remaining: status.remaining,
              reset: status.reset.toISOString(),
            },
            `Token ${index + 1} (${status.token}): ${status.remaining} remaining, resets at ${status.reset.toISOString()}`,
          );
        });
        this.logger.info("=====================================\n");
      } else {
        // For GitHub App, use the base class method
        await this.auth.checkRateLimits(this.logger);
      }
    } catch (error) {
      this.logger.error({ err: error }, "Failed to check rate limits");
      throw error;
    }
  }

  /**
   * Add a small delay between requests to be conservative with rate limiting
   */
  private async addRequestDelay(): Promise<void> {
    // Add a small delay between requests to be conservative
    await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
  }

  /**
   * Fetch all repositories for a given organization
   */
  async fetchOrganizationRepositories(orgName: string): Promise<Repository[]> {
    const allRepos: Repository[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      await this.addRequestDelay();
      const { data: orgRepos } = await this.makeRequest(async (octokit) => {
        return octokit.repos.listForOrg({
          org: orgName,
          sort: "pushed", // default = direction: desc
          per_page: 100,
          page: page,
        });
      });

      allRepos.push(...orgRepos);
      this.logger.info(
        { count: orgRepos.length, orgName, page },
        `Fetched ${orgRepos.length} repos from ${orgName} (page ${page})`,
      );

      // If we got less than 100 repos, we've reached the end
      hasMore = orgRepos.length === 100;
      page++;
    }

    return allRepos;
  }

  /**
   * Fetch raw audit log data from enterprise (enterprise feature only)
   * Uses the /enterprises/{enterprise}/audit-log endpoint
   */
  async getAuditLog(params: AuditLogParams): Promise<any[]> {
    if (!this.enterpriseName) {
      this.logger.warn(
        { params },
        `Audit log is an enterprise feature. Set X_GITHUB_ENTERPRISE to enable.`,
      );
      return [];
    }

    await this.addRequestDelay();

    const data = await this.makeRequest(async (octokit) => {
      return (await octokit.paginate(
        "GET /enterprises/{enterprise}/audit-log",
        {
          enterprise: this.enterpriseName!,
          phrase: params.phrase,
          include: params.include || "web",
          per_page: params.per_page || 100,
          order: params.order || "desc",
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      )) as Array<any>;
    });

    this.logger.info(
      {
        count: data.length,
        enterprise: this.enterpriseName,
        phrase: params.phrase,
      },
      `Fetched ${data.length} audit log events (enterprise: ${this.enterpriseName})`,
    );

    return data;
  }

  /**
   * Get member add dates from enterprise audit log (enterprise feature only)
   * Uses the /enterprises/{enterprise}/audit-log endpoint
   */
  async getMemberAddDates(orgName: string): Promise<AuditLogEntry[]> {
    const data = await this.getAuditLog({
      phrase: `action:org.add_member org:${orgName}`,
    });

    if (data.length > 0) {
      const uniqueUsers = new Set(data.map((x) => x.user));
      this.logger.info(
        { uniqueUserCount: uniqueUsers.size, orgName },
        `Found member additions for ${uniqueUsers.size} unique users in ${orgName}`,
      );
    }

    return data.map((x) => ({
      user: x.user,
      user_id: x.user_id,
      created_at: x["@timestamp"],
      org: x.org,
    }));
  }

  /**
   * Search for commits by author and organization
   */
  async searchCommits(author: string, orgName: string): Promise<Commit[]> {
    await this.addRequestDelay();

    // Validate input parameters
    if (!author || !author.trim()) {
      this.logger.warn("Author parameter is empty, skipping commit search");
      return [];
    }

    if (!orgName || !orgName.trim()) {
      this.logger.warn(
        "Organization parameter is empty, skipping commit search",
      );
      return [];
    }

    // Construct search query with actual search text
    const searchQuery = `${author} author:${author} org:${orgName} sort:committer-date-asc`;

    const { data: commits } = await this.makeRequest(async (octokit) => {
      return octokit.request("GET /search/commits ", {
        q: searchQuery,
        advanced_search: true,
        per_page: 10,
        page: 1,
        headers: {
          "If-None-Match": "", // Bypass cache to avoid stale results
          Accept: "application/vnd.github.v3+json", // Specify API version
        },
      });
    });

    return commits.items;
  }

  /**
   * Search for pull requests by author and organization
   */
  async searchPullRequests(
    author: string,
    orgName: string,
  ): Promise<PullRequestBasic[]> {
    await this.addRequestDelay();

    // Validate input parameters
    if (!author || !author.trim()) {
      this.logger.warn(
        "Author parameter is empty, skipping pull request search",
      );
      return [];
    }

    if (!orgName || !orgName.trim()) {
      this.logger.warn(
        "Organization parameter is empty, skipping pull request search",
      );
      return [];
    }

    // Construct search query with actual search text
    const searchQuery = `${author} author:${author} org:${orgName} is:pr`;

    const { data: pulls } = await this.makeRequest(async (octokit) => {
      return octokit.search.issuesAndPullRequests({
        q: searchQuery,
        per_page: 100,
        sort: "created",
        order: "desc",
      });
    });

    return pulls.items.map((pull) => ({
      id: pull.id,
      number: pull.number,
      created_at: pull.created_at,
      closed_at: pull.closed_at,
      merged_at: (pull as { merged_at?: string }).merged_at,
      user: pull.user,
    }));
  }

  /**
   * Search for reviews by reviewer and organization
   */
  async searchReviews(
    _reviewer: string,
    _orgName: string,
  ): Promise<PullRequestReview[]> {
    await this.addRequestDelay();
    // Note: This search returns PRs, not individual reviews
    // We'd need to fetch reviews for each PR separately
    return [];
  }

  /**
   * Get commits for a repository
   */
  async getRepositoryCommits(
    owner: string,
    repo: string,
    options: {
      per_page?: number;
      page?: number;
    } = {},
  ): Promise<Commit[]> {
    await this.addRequestDelay();
    const { data: commits } = await this.makeRequest(async (octokit) => {
      return octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: options.per_page || 100,
        page: options.page || 1,
      });
    });

    return commits;
  }

  /**
   * Get pull requests for a repository (basic info only)
   */
  async getPullRequests(
    owner: string,
    repo: string,
    options: {
      state?: "open" | "closed" | "all";
      sort?: "created" | "updated" | "popularity" | "long-running";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    } = {},
  ): Promise<PullRequestBasic[]> {
    await this.addRequestDelay();

    try {
      const { data: prs } = await this.makeRequest(async (octokit) => {
        return octokit.rest.pulls.list({
          owner,
          repo,
          state: options.state || "closed",
          sort: options.sort || "created",
          direction: options.direction || "desc",
          per_page: options.per_page || 100,
          page: options.page || 1,
        });
      });

      return prs;
    } catch (error: any) {
      if (error.status === 404) {
        this.logger.error(
          { owner, repo, status: error.status },
          `Repository not found or no access: ${owner}/${repo}. Status: ${error.status}`,
        );
        this.logger.error(`This could be due to:`);
        this.logger.error(`1. Repository doesn't exist`);
        this.logger.error(
          `2. GitHub App doesn't have access to this repository`,
        );
        this.logger.error(`3. Repository name or owner is incorrect`);
        this.logger.error(`4. Repository is private and app lacks permissions`);
        return [];
      } else if (error.status === 403) {
        this.logger.error(
          { owner, repo, status: error.status },
          `Access denied to repository: ${owner}/${repo}. Status: ${error.status}`,
        );
        this.logger.error(
          `This could be due to insufficient permissions or rate limiting`,
        );
        return [];
      } else {
        this.logger.error(
          { owner, repo, err: error },
          `Error fetching pull requests for ${owner}/${repo}: ${error.message || "Unknown error"}`,
        );
        throw error; // Re-throw other errors to be handled by the retry mechanism
      }
    }
  }

  /**
   * Get a specific pull request
   */
  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequest> {
    await this.addRequestDelay();
    const { data: prData } = await this.makeRequest(async (octokit) => {
      return octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
    });

    return prData;
  }

  /**
   * Get reviews for a pull request
   */
  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestReview[]> {
    await this.addRequestDelay();
    const { data: reviews } = await this.makeRequest(async (octokit) => {
      return octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
      });
    });

    return reviews;
  }

  /**
   * Get commits for a pull request
   */
  async getPullRequestCommits(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<Commit[]> {
    await this.addRequestDelay();
    const response = await this.makeRequest(async (octokit) => {
      return octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: pullNumber,
      });
    });

    return response.data;
  }

  /**
   * Get workflow runs for a repository
   */
  async getWorkflowRuns(
    owner: string,
    repo: string,
    branch?: string,
  ): Promise<WorkflowRun[]> {
    await this.addRequestDelay();
    const {
      data: { workflow_runs: runs },
    } = await this.makeRequest(async (octokit) => {
      return octokit.request("GET /repos/{owner}/{repo}/actions/runs", {
        owner,
        repo,
        branch: branch,
        exclude_pull_requests: true,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    });

    return runs;
  }

  /**
   * Get issues for a repository
   */
  async getIssues(
    owner: string,
    repo: string,
    options: {
      state?: "open" | "closed" | "all";
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    } = {},
  ): Promise<
    {
      id: number;
      number: number;
      created_at: string;
      user?: { login: string } | null;
    }[]
  > {
    await this.addRequestDelay();
    const { data: issues } = await this.makeRequest(async (octokit) => {
      return octokit.issues.listForRepo({
        owner,
        repo,
        ...options,
      });
    });

    return issues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      created_at: issue.created_at,
      user: issue.user,
    }));
  }

  /**
   * Get comments for a specific issue or PR
   */
  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<
    { id: number; created_at: string; user?: { login: string } | null }[]
  > {
    await this.addRequestDelay();
    const { data: comments } = await this.makeRequest(async (octokit) => {
      return octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
      });
    });

    return comments.map((comment) => ({
      id: comment.id,
      created_at: comment.created_at,
      user: comment.user,
    }));
  }
}

/**
 * Factory function to create a GitHub client instance using automatic authentication detection
 */
export function createGitHubClient(
  config: GitHubAuthConfig,
  logger: Logger,
): GitHubClient {
  const auth = createGitHubAuth(config, logger);
  return new GitHubClient(auth, logger, config.enterpriseName);
}
