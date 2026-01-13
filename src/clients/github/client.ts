import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import type {
  AuditLogEntry,
  Commit,
  PullRequest,
  PullRequestBasic,
  PullRequestReview,
  Repository,
  WorkflowRun,
} from "./types";
import { GitHubAuth } from "./auth";
/**
 * Factory function to create the appropriate authentication method
 */


export class GitHubClient {
  private octokit: Octokit | null = null;
  private auth: GitHubAuth;

  constructor(auth: GitHubAuth) {
    this.auth = auth;
  }

  private async ensureValidOctokit(): Promise<void> {
    if (!this.octokit || !this.auth.isTokenValid()) {
      this.octokit = await this.auth.getOctokit();
    }
  }

  /**
   * Extract rate limit information from API response headers
   */
  private extractRateLimitInfo(
    response: any,
  ): { remaining: number; reset: number } | null {
    if (!response || typeof response !== "object") return null;

    // Check if response has headers property
    const headers = response.headers || response.response?.headers;
    if (!headers) return null;

    const remaining = headers["x-ratelimit-remaining"];
    const reset = headers["x-ratelimit-reset"];

    if (remaining !== undefined && reset !== undefined) {
      return {
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10) * 1000, // Convert to milliseconds
      };
    }

    return null;
  }

  /**
   * Makes a request with automatic token rotation for PAT authentication
   */
  private async makeRequestWithTokenRotation<T>(
    requestFn: (octokit: Octokit) => Promise<T>,
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempts = 0;
    const maxAttempts =
      this.auth instanceof PATAuth ? this.auth.getTokenCount() : 1;
    const maxRetries = 3; // Maximum retries per token

    while (attempts < maxAttempts) {
      try {
        await this.ensureValidOctokit();
        if (!this.octokit) {
          throw new Error("Failed to create Octokit instance");
        }

        const result = await requestFn(this.octokit);

        // Update rate limits for PAT authentication using response headers
        if (this.auth instanceof PATAuth) {
          const rateLimitInfo = this.extractRateLimitInfo(result);
          if (rateLimitInfo) {
            this.auth.updateRateLimits(
              rateLimitInfo.remaining,
              rateLimitInfo.reset,
            );
          }
        }

        return result;
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error using response headers
        if (
          error.status === 403 &&
          error.response?.headers?.["x-ratelimit-remaining"] === "0"
        ) {
          const resetTime = error.response?.headers?.["x-ratelimit-reset"];
          const secondsUntilReset = resetTime
            ? parseInt(resetTime, 10) - Math.floor(Date.now() / 1000)
            : 0;

          console.log(
            `Rate limit exceeded. Reset in ${secondsUntilReset} seconds.`,
          );

          if (this.auth instanceof PATAuth) {
            // For PAT auth, try token rotation first
            if (attempts < maxAttempts - 1) {
              console.log("Attempting token rotation...");
              this.auth.rotateToken();
              this.octokit = null; // Force recreation of Octokit instance
              attempts++;
              continue;
            } else {
              // All tokens exhausted, wait for the token with earliest reset
              console.log(
                "All tokens exhausted. Waiting for rate limit reset...",
              );
              await this.waitForRateLimitReset();
              attempts = 0; // Reset attempts and try again
              continue;
            }
          } else {
            // For GitHub App or single PAT, wait for reset
            console.log("Waiting for rate limit reset...");
            await this.waitForRateLimitReset(secondsUntilReset);
            continue;
          }
        }

        // For other errors, implement exponential backoff
        if (attempts < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds
          console.log(
            `Request failed (attempt ${attempts + 1}/${maxRetries}). Retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempts++;
          continue;
        }

        // For other errors or if max retries exceeded, don't retry
        break;
      }
    }

    throw lastError || new Error("Request failed after all attempts");
  }

  /**
   * Wait for rate limit reset
   */
  private async waitForRateLimitReset(
    secondsUntilReset?: number,
  ): Promise<void> {
    let waitTime = secondsUntilReset || 3600; // Default to 1 hour if not specified

    if (this.auth instanceof PATAuth) {
      // For PAT auth, find the token with the earliest reset time
      const tokenStatus = this.auth.getRateLimitStatus();
      const now = Date.now();
      const earliestReset = Math.min(
        ...tokenStatus.map((status) => status.reset.getTime()),
      );
      waitTime = Math.max(0, Math.ceil((earliestReset - now) / 1000));
    }

    if (waitTime > 0) {
      console.log(`Waiting ${waitTime} seconds for rate limit reset...`);

      // Wait in chunks to allow for early termination
      const chunkSize = Math.min(waitTime, 60); // Wait in 1-minute chunks
      const chunks = Math.ceil(waitTime / chunkSize);

      for (let i = 0; i < chunks; i++) {
        const remainingTime = waitTime - i * chunkSize;
        const currentChunk = Math.min(chunkSize, remainingTime);

        if (currentChunk > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, currentChunk * 1000),
          );

          // Log progress every 5 minutes
          if (i % 5 === 0 && remainingTime > 60) {
            console.log(
              `Rate limit reset in progress: ${Math.ceil(remainingTime / 60)} minutes remaining...`,
            );
          }
        }
      }

      console.log("Rate limit reset complete. Continuing...");
    }
  }

  /**
   * Check rate limits and log status
   */
  async checkRateLimits(): Promise<void> {
    try {
      await this.ensureValidOctokit();
      if (!this.octokit) {
        throw new Error("Failed to create Octokit instance");
      }

      // Make a simple API call to get rate limit headers
      const result = await this.makeRequestWithTokenRotation(
        async (octokit) => {
          return octokit.rest.rateLimit.get();
        },
      );

      // Update rate limits for PAT authentication using response headers
      if (this.auth instanceof PATAuth) {
        const rateLimitInfo = this.extractRateLimitInfo(result);
        if (rateLimitInfo) {
          this.auth.updateRateLimits(
            rateLimitInfo.remaining,
            rateLimitInfo.reset,
          );
        }

        // Log status for all tokens
        const tokenStatus = this.auth.getRateLimitStatus();
        console.log(`\n=== PAT Token Rate Limit Status ===`);
        console.log(`Total tokens available: ${this.auth.getTokenCount()}`);
        tokenStatus.forEach((status, index) => {
          console.log(
            `Token ${index + 1} (${status.token}): ${status.remaining} remaining, resets at ${status.reset.toISOString()}`,
          );
        });
        console.log("=====================================\n");
      } else {
        // For GitHub App auth, use the data from the rate limit response
        if (result && typeof result === "object" && "data" in result) {
          const rateLimitData = (result as any).data;
          if (rateLimitData && rateLimitData.rate) {
            console.log(
              `Rate limit: ${rateLimitData.rate.remaining}/${rateLimitData.rate.limit} remaining, resets at ${new Date(rateLimitData.rate.reset * 1000).toISOString()}`,
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to check rate limits:", error);
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
      const { data: orgRepos } = await this.makeRequestWithTokenRotation(
        async (octokit) => {
          return octokit.repos.listForOrg({
            org: orgName,
            sort: "pushed", // default = direction: desc
            per_page: 100,
            page: page,
          });
        },
      );

      allRepos.push(...orgRepos);
      console.log(
        `Fetched ${orgRepos.length} repos from ${orgName} (page ${page})`,
      );

      // If we got less than 100 repos, we've reached the end
      hasMore = orgRepos.length === 100;
      page++;
    }

    return allRepos;
  }

  /**
   * Get member add dates from organization audit log
   */
  async getMemberAddDates(orgName: string): Promise<AuditLogEntry[]> {
    await this.addRequestDelay();

    let data = await this.makeRequestWithTokenRotation(async (octokit) => {
      return (await octokit.paginate("GET /orgs/{org}/audit-log", {
        org: orgName,
        phrase: "action:org.add_member",
        include: "web",
        per_page: 100,
        order: "desc",
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      })) as Array<{
        org: string;
        user: string;
        user_id: number;
        "@timestamp": string;
      }>;
    });

    console.log(
      `Fetched ${data.length} audit log events for member additions from ${orgName}`,
    );

    // Log a summary instead of the full data
    if (data.length > 0) {
      const uniqueUsers = new Set(data.map((x) => x.user));
      console.log(
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
   * Get raw member add audit log data for debugging purposes
   */
  async getRawMemberAddDates(orgName: string): Promise<any[]> {
    await this.addRequestDelay();

    let data = await this.makeRequestWithTokenRotation(async (octokit) => {
      return (await octokit.paginate("GET /orgs/{org}/audit-log", {
        org: orgName,
        phrase: "action:org.add_member",
        include: "web",
        per_page: 100,
        order: "desc",
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      })) as Array<any>;
    });

    console.log(
      `Fetched ${data.length} raw audit log events for member additions from ${orgName}`,
    );

    return data; // Return completely raw data
  }

  /**
   * Search for commits by author and organization
   */
  async searchCommits(author: string, orgName: string): Promise<Commit[]> {
    await this.addRequestDelay();

    // Validate input parameters
    if (!author || !author.trim()) {
      console.log("Author parameter is empty, skipping commit search");
      return [];
    }

    if (!orgName || !orgName.trim()) {
      console.log("Organization parameter is empty, skipping commit search");
      return [];
    }

    // Construct search query with actual search text
    const searchQuery = `${author} author:${author} org:${orgName} sort:committer-date-asc`;

    const { data: commits } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
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
      },
    );

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
      console.log("Author parameter is empty, skipping pull request search");
      return [];
    }

    if (!orgName || !orgName.trim()) {
      console.log(
        "Organization parameter is empty, skipping pull request search",
      );
      return [];
    }

    // Construct search query with actual search text
    const searchQuery = `${author} author:${author} org:${orgName} is:pr`;

    const { data: pulls } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.search.issuesAndPullRequests({
          q: searchQuery,
          per_page: 100,
          sort: "created",
          order: "desc",
        });
      },
    );

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
    const { data: commits } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.rest.repos.listCommits({
          owner,
          repo,
          per_page: options.per_page || 100,
          page: options.page || 1,
        });
      },
    );

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
      const { data: prs } = await this.makeRequestWithTokenRotation(
        async (octokit) => {
          return octokit.rest.pulls.list({
            owner,
            repo,
            state: options.state || "closed",
            sort: options.sort || "created",
            direction: options.direction || "desc",
            per_page: options.per_page || 100,
            page: options.page || 1,
          });
        },
      );

      return prs;
    } catch (error: any) {
      if (error.status === 404) {
        console.error(
          `Repository not found or no access: ${owner}/${repo}. Status: ${error.status}`,
        );
        console.error(`This could be due to:`);
        console.error(`1. Repository doesn't exist`);
        console.error(`2. GitHub App doesn't have access to this repository`);
        console.error(`3. Repository name or owner is incorrect`);
        console.error(`4. Repository is private and app lacks permissions`);
        return [];
      } else if (error.status === 403) {
        console.error(
          `Access denied to repository: ${owner}/${repo}. Status: ${error.status}`,
        );
        console.error(
          `This could be due to insufficient permissions or rate limiting`,
        );
        return [];
      } else {
        console.error(
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
    const { data: prData } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        });
      },
    );

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
    const { data: reviews } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pullNumber,
        });
      },
    );

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
    const response = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.pulls.listCommits({
          owner,
          repo,
          pull_number: pullNumber,
        });
      },
    );

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
    } = await this.makeRequestWithTokenRotation(async (octokit) => {
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
    const { data: issues } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.issues.listForRepo({
          owner,
          repo,
          ...options,
        });
      },
    );

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
    const { data: comments } = await this.makeRequestWithTokenRotation(
      async (octokit) => {
        return octokit.issues.listComments({
          owner,
          repo,
          issue_number: issueNumber,
        });
      },
    );

    return comments.map((comment) => ({
      id: comment.id,
      created_at: comment.created_at,
      user: comment.user,
    }));
  }

  /**
   * Check if any tokens are available for use
   */
  private hasAvailableTokens(): boolean {
    if (this.auth instanceof PATAuth) {
      // Access the method through the token manager
      return (this.auth as any).tokenManager?.hasAvailableTokens() || false;
    }
    return true; // For GitHub App, assume always available
  }

  /**
   * Get the earliest reset time for any token
   */
  private getEarliestResetTime(): number | null {
    if (this.auth instanceof PATAuth) {
      const tokenStatus = this.auth.getRateLimitStatus();
      const now = Date.now();
      const resetTimes = tokenStatus.map((status) => status.reset.getTime());
      return Math.min(...resetTimes);
    }
    return null;
  }
}

/**
 * Factory function to create a GitHub client instance using automatic authentication detection
 */
export function createGitHubClient(config: GitHubAuthConfig): GitHubClient {
  const auth = createGitHubAuth(config);
  return new GitHubClient(auth);
}
