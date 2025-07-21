import { Octokit } from '@octokit/rest';
import type {
  AuditLogEntry,
  Commit,
  PullRequest,
  PullRequestBasic,
  PullRequestReview,
  Repository,
  WorkflowRun,
} from '../types/github';

export class GitHubClient {
  private octokit: Octokit;

  constructor(authToken: string) {
    this.octokit = new Octokit({ auth: authToken });
  }

  /**
   * Get current rate limit status for debugging
   */
  async getRateLimitStatus(): Promise<{
    remaining: number;
    limit: number;
    resetTime: Date;
    secondsUntilReset: number;
  }> {
    const resp = await this.octokit.rateLimit.get();
    const remaining = Number.parseInt(resp.headers['x-ratelimit-remaining'] || '0');
    const limit = Number.parseInt(resp.headers['x-ratelimit-limit'] || '0');
    const resetTime = new Date(Number.parseInt(resp.headers['x-ratelimit-reset'] || '') * 1000);
    const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);

    return {
      remaining,
      limit,
      resetTime,
      secondsUntilReset,
    };
  }

  /**
   * Check rate limits and wait if necessary
   */
  async checkRateLimits(): Promise<void> {
    const resp = await this.octokit.rateLimit.get();
    const remaining = Number.parseInt(resp.headers['x-ratelimit-remaining'] || '0');
    const resetTime = new Date(Number.parseInt(resp.headers['x-ratelimit-reset'] || '') * 1000);
    const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);

    if (remaining <= 0) {
      // Wait if we have no requests left
      console.log(`Rate limit exceeded. Waiting ${secondsUntilReset} seconds until reset...`);
      await new Promise((resolve) => setTimeout(resolve, (secondsUntilReset + 10) * 1000)); // Add 10 seconds buffer
      console.log('Rate limit reset, continuing...');
    } else if (remaining <= 5) {
      // Wait if we have 5 or fewer requests left
      console.log(
        `Rate limit low (${remaining} requests left). Waiting ${secondsUntilReset} seconds until reset...`
      );
      await new Promise((resolve) => setTimeout(resolve, (secondsUntilReset + 10) * 1000)); // Add 10 seconds buffer
      console.log('Rate limit reset, continuing...');
    } else if (remaining <= 20) {
      // Add small delay if we're getting low
      console.log(`Rate limit getting low (${remaining} requests left). Adding small delay...`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
    }
  }

  /**
   * Makes a GitHub API request with exponential backoff retry logic and rate limit handling
   */
  async makeRequestWithRetry<T>(requestFn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error = new Error('Request failed after all retries');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check rate limits before making request
        await this.checkRateLimits();
        return await requestFn();
      } catch (error: unknown) {
        lastError = error as Error;

        // For rate limit errors, wait for the reset time and retry
        const errorWithStatus = error as {
          status?: number;
          response?: { headers?: Record<string, string> };
        };
        if (errorWithStatus.status === 403 || errorWithStatus.status === 429) {
          console.log(`Rate limit error (${errorWithStatus.status}) - waiting for reset...`);

          // Extract reset time from error headers if available
          let resetTime = errorWithStatus.response?.headers?.['x-ratelimit-reset'];
          if (!resetTime && errorWithStatus.response?.headers?.['retry-after']) {
            // Some APIs return retry-after header instead
            const retryAfter = Number.parseInt(errorWithStatus.response.headers['retry-after']);
            if (retryAfter) {
              resetTime = (Math.floor(Date.now() / 1000) + retryAfter).toString();
            }
          }

          if (resetTime) {
            const resetDate = new Date(Number.parseInt(resetTime) * 1000);
            const secondsUntilReset = Math.floor((resetDate.getTime() - Date.now()) / 1000);
            if (secondsUntilReset > 0) {
              console.log(`Waiting ${secondsUntilReset} seconds for rate limit reset...`);
              await new Promise((resolve) => setTimeout(resolve, (secondsUntilReset + 10) * 1000)); // Add 10 seconds buffer
              console.log('Rate limit reset, retrying...');
              continue; // Retry the request
            }
          }
        }

        // For other errors, implement exponential backoff
        if (attempt < maxRetries) {
          const delay = 2 ** attempt * 1000; // Exponential backoff: 1s, 2s, 4s, 8s...
          console.log(
            `Request failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
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
      const { data: orgRepos } = await this.makeRequestWithRetry(() =>
        this.octokit.repos.listForOrg({
          org: orgName,
          sort: 'pushed', // default = direction: desc
          per_page: 100,
          page: page,
        })
      );

      allRepos.push(...orgRepos);
      console.log(`Fetched ${orgRepos.length} repos from ${orgName} (page ${page})`);

      // If we got less than 100 repos, we've reached the end
      hasMore = orgRepos.length === 100;
      page++;
    }

    return allRepos;
  }

  /**
   * Get member add dates from enterprise audit log
   */
  async getMemberAddDates(enterprise: string): Promise<AuditLogEntry[]> {
    await this.addRequestDelay();
    let data = (await this.octokit.paginate('GET /enterprises/{enterprise}/audit-log', {
      enterprise,
      phrase: 'action:org.add_member',
      include: 'web',
      per_page: 100,
      order: 'desc',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })) as Array<{ org_id: number; user: string; user_id: number; created_at: string }>;

    data = data.filter((x) => x.org_id === 177709801);
    console.log(`Fetched ${data.length} audit log events`);
    console.log(JSON.stringify(data));

    return data.map((x) => ({
      user: x.user,
      user_id: x.user_id,
      created_at: x.created_at,
      org_id: x.org_id,
    }));
  }

  /**
   * Search for commits by author and organization
   */
  async searchCommits(author: string, orgName: string): Promise<Commit[]> {
    await this.addRequestDelay();
    const { data: commits } = await this.makeRequestWithRetry(() =>
      this.octokit.request('GET /search/commits ', {
        q: `author:${author} org:${orgName} sort:committer-date-asc`,
        advanced_search: true,
        per_page: 10,
        page: 1,
        headers: {
          'If-None-Match': '', // Bypass cache to avoid stale results
          Accept: 'application/vnd.github.v3+json', // Specify API version
        },
      })
    );

    return commits.items;
  }

  /**
   * Search for pull requests by author and organization
   */
  async searchPullRequests(author: string, orgName: string): Promise<PullRequestBasic[]> {
    await this.addRequestDelay();
    const { data: pulls } = await this.makeRequestWithRetry(() =>
      this.octokit.search.issuesAndPullRequests({
        q: `author:${author} org:${orgName} is:pr`,
        per_page: 100,
        sort: 'created',
        order: 'desc',
      })
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
  async searchReviews(_reviewer: string, _orgName: string): Promise<PullRequestReview[]> {
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
    } = {}
  ): Promise<Commit[]> {
    await this.addRequestDelay();
    const { data: commits } = await this.makeRequestWithRetry(() =>
      this.octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: options.per_page || 100,
        page: options.page || 1,
      })
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
      state?: 'open' | 'closed' | 'all';
      sort?: 'created' | 'updated' | 'popularity' | 'long-running';
      direction?: 'asc' | 'desc';
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<PullRequestBasic[]> {
    await this.addRequestDelay();
    const { data: prs } = await this.makeRequestWithRetry(() =>
      this.octokit.rest.pulls.list({
        owner,
        repo,
        state: options.state || 'closed',
        sort: options.sort || 'created',
        direction: options.direction || 'desc',
        per_page: options.per_page || 100,
        page: options.page || 1,
      })
    );

    return prs;
  }

  /**
   * Get a specific pull request
   */
  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    await this.addRequestDelay();
    const { data: prData } = await this.makeRequestWithRetry(() =>
      this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      })
    );

    return prData;
  }

  /**
   * Get reviews for a pull request
   */
  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequestReview[]> {
    await this.addRequestDelay();
    const { data: reviews } = await this.makeRequestWithRetry(() =>
      this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
      })
    );

    return reviews;
  }

  /**
   * Get commits for a pull request
   */
  async getPullRequestCommits(owner: string, repo: string, pullNumber: number): Promise<Commit[]> {
    await this.addRequestDelay();
    const response = await this.makeRequestWithRetry(() =>
      this.octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: pullNumber,
      })
    );

    return response.data;
  }

  /**
   * Get workflow runs for a repository
   */
  async getWorkflowRuns(owner: string, repo: string, branch?: string): Promise<WorkflowRun[]> {
    await this.addRequestDelay();
    const {
      data: { workflow_runs: runs },
    } = await this.makeRequestWithRetry(() =>
      this.octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
        owner,
        repo,
        branch: branch,
        exclude_pull_requests: true,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
    );

    return runs;
  }

  /**
   * Get issues for a repository
   */
  async getIssues(
    owner: string,
    repo: string,
    options: {
      state?: 'open' | 'closed' | 'all';
      sort?: 'created' | 'updated' | 'comments';
      direction?: 'asc' | 'desc';
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<
    { id: number; number: number; created_at: string; user?: { login: string } | null }[]
  > {
    await this.addRequestDelay();
    const { data: issues } = await this.makeRequestWithRetry(() =>
      this.octokit.issues.listForRepo({
        owner,
        repo,
        ...options,
      })
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
    issueNumber: number
  ): Promise<{ id: number; created_at: string; user?: { login: string } | null }[]> {
    await this.addRequestDelay();
    const { data: comments } = await this.makeRequestWithRetry(() =>
      this.octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
      })
    );

    return comments.map((comment) => ({
      id: comment.id,
      created_at: comment.created_at,
      user: comment.user,
    }));
  }
}

/**
 * Factory function to create a GitHub client instance
 */
export function createGitHubClient(authToken: string): GitHubClient {
  return new GitHubClient(authToken);
}
