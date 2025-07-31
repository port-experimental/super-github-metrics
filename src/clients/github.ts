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

/**
 * Manages multiple GitHub tokens and rotates between them based on rate limits
 */
export class TokenRotationManager {
  private tokens: string[];
  private currentTokenIndex: number = 0;
  private tokenStatus: Map<string, {
    remaining: number;
    limit: number;
    resetTime: Date;
    isAvailable: boolean;
  }> = new Map();

  constructor(tokens: string[]) {
    this.tokens = tokens.filter(token => token.trim().length > 0);
    if (this.tokens.length === 0) {
      throw new Error('At least one valid GitHub token is required');
    }
    
    // Initialize token status
    this.tokens.forEach(token => {
      this.tokenStatus.set(token, {
        remaining: 5000, // Default limit, will be updated on first check
        limit: 5000,
        resetTime: new Date(),
        isAvailable: true,
      });
    });
  }

  /**
   * Get the current available token
   */
  getCurrentToken(): string {
    return this.tokens[this.currentTokenIndex];
  }

  /**
   * Get all tokens
   */
  getAllTokens(): string[] {
    return this.tokens;
  }

  /**
   * Update rate limit status for a specific token
   */
  updateTokenStatus(token: string, status: {
    remaining: number;
    limit: number;
    resetTime: Date;
  }): void {
    const currentStatus = this.tokenStatus.get(token);
    if (currentStatus) {
      currentStatus.remaining = status.remaining;
      currentStatus.limit = status.limit;
      currentStatus.resetTime = status.resetTime;
      currentStatus.isAvailable = status.remaining > 0;
    }
  }

  /**
   * Check if current token is available
   */
  isCurrentTokenAvailable(): boolean {
    const currentToken = this.getCurrentToken();
    const status = this.tokenStatus.get(currentToken);
    return status?.isAvailable ?? false;
  }

  /**
   * Find next available token
   */
  findNextAvailableToken(): string | null {
    // Check all tokens starting from current position
    for (let i = 0; i < this.tokens.length; i++) {
      const tokenIndex = (this.currentTokenIndex + i) % this.tokens.length;
      const token = this.tokens[tokenIndex];
      const status = this.tokenStatus.get(token);
      
      if (status?.isAvailable) {
        this.currentTokenIndex = tokenIndex;
        return token;
      }
    }
    
    // If no tokens are available, check if any have reset
    const now = new Date();
    for (let i = 0; i < this.tokens.length; i++) {
      const tokenIndex = (this.currentTokenIndex + i) % this.tokens.length;
      const token = this.tokens[tokenIndex];
      const status = this.tokenStatus.get(token);
      
      if (status && status.resetTime <= now) {
        status.isAvailable = true;
        status.remaining = status.limit;
        this.currentTokenIndex = tokenIndex;
        return token;
      }
    }
    
    return null;
  }

  /**
   * Find the best available token (one with most remaining requests or shortest reset time)
   */
  findBestAvailableToken(): string | null {
    let bestToken: string | null = null;
    let bestScore = -1;
    const now = new Date();

    // Check all tokens for the one with best score
    for (const [token, status] of this.tokenStatus.entries()) {
      let score = 0;
      
      if (status.isAvailable) {
        // Available token: score based on remaining requests
        score = status.remaining;
      } else {
        // Unavailable token: score based on time until reset
        // The sooner it resets, the higher the score
        const timeUntilReset = status.resetTime.getTime() - now.getTime();
        if (timeUntilReset <= 0) {
          // Token has reset, mark it as available
          status.isAvailable = true;
          status.remaining = status.limit;
          score = status.limit; // Full score for newly reset token
        } else {
          // Token will reset soon: score inversely proportional to wait time
          // Convert to minutes and invert (shorter wait = higher score)
          const minutesUntilReset = Math.max(1, timeUntilReset / (1000 * 60));
          score = Math.floor(status.limit / minutesUntilReset);
        }
      }

      if (score > bestScore) {
        bestToken = token;
        bestScore = score;
      }
    }

    // Update current token index if we found a better token
    if (bestToken) {
      this.currentTokenIndex = this.tokens.indexOf(bestToken);
    }

    return bestToken;
  }

  /**
   * Rotate to next available token
   */
  rotateToNextAvailableToken(): string | null {
    const availableToken = this.findNextAvailableToken();
    if (availableToken) {
      console.log(`Switched to token ${this.currentTokenIndex + 1} of ${this.tokens.length}`);
    } else {
      console.log('No available tokens found, waiting for rate limit reset...');
    }
    return availableToken;
  }

  /**
   * Get status of all tokens
   */
  getAllTokenStatus(): Map<string, {
    remaining: number;
    limit: number;
    resetTime: Date;
    isAvailable: boolean;
  }> {
    return new Map(this.tokenStatus);
  }
}

export class GitHubClient {
  private octokit: Octokit;
  private tokenManager: TokenRotationManager;
  private currentToken: string;

  constructor(tokens: string | string[]) {
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    this.tokenManager = new TokenRotationManager(tokenArray);
    this.currentToken = this.tokenManager.getCurrentToken();
    this.octokit = new Octokit({ auth: this.currentToken });
  }

  /**
   * Update the Octokit instance with a new token
   */
  private updateOctokitToken(token: string): void {
    this.currentToken = token;
    this.octokit = new Octokit({ auth: token });
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

    // Update token status
    this.tokenManager.updateTokenStatus(this.currentToken, {
      remaining,
      limit,
      resetTime,
    });

    return {
      remaining,
      limit,
      resetTime,
      secondsUntilReset,
    };
  }

  /**
   * Check rate limits and rotate tokens if necessary
   */
  async checkRateLimits(): Promise<void> {
    const resp = await this.octokit.rateLimit.get();
    const remaining = Number.parseInt(resp.headers['x-ratelimit-remaining'] || '0');
    const resetTime = new Date(Number.parseInt(resp.headers['x-ratelimit-reset'] || '') * 1000);
    const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);

    // Update token status
    this.tokenManager.updateTokenStatus(this.currentToken, {
      remaining,
      limit: Number.parseInt(resp.headers['x-ratelimit-limit'] || '0'),
      resetTime,
    });

    // Get all token statuses to make informed rotation decisions
    const allTokenStatus = this.tokenManager.getAllTokenStatus();
    const totalTokens = allTokenStatus.size;

    if (remaining <= 0) {
      console.log(`Rate limit exceeded for current token. Attempting to rotate...`);
      
      if (totalTokens === 1) {
        // Single token scenario - must wait for reset
        console.log(`Single token configuration. Waiting ${secondsUntilReset} seconds until reset...`);
        await new Promise((resolve) => setTimeout(resolve, (secondsUntilReset + 10) * 1000)); // Add 10 seconds buffer
        console.log('Rate limit reset, continuing...');
        return;
      }

      // Multiple tokens - try to find a better one
      const nextToken = this.tokenManager.findBestAvailableToken();
      if (nextToken && nextToken !== this.currentToken) {
        this.updateOctokitToken(nextToken);
        console.log('Successfully rotated to next available token');
      } else {
        // No better token available, wait for reset
        console.log(`No available tokens. Waiting ${secondsUntilReset} seconds until reset...`);
        await new Promise((resolve) => setTimeout(resolve, (secondsUntilReset + 10) * 1000)); // Add 10 seconds buffer
        console.log('Rate limit reset, continuing...');
      }
    } else if (remaining <= 5) {
      // Low rate limit - only rotate if we have multiple tokens and can find a better one
      console.log(`Rate limit low (${remaining} requests left) for current token.`);
      
      if (totalTokens === 1) {
        // Single token - just add a delay to be conservative
        console.log(`Single token configuration. Adding delay to be conservative...`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
        return;
      }

      // Multiple tokens - check if there's a significantly better token
      const currentTokenStatus = allTokenStatus.get(this.currentToken);
      let bestToken = this.currentToken;
      let bestScore = remaining; // Current token's score
      const now = new Date();

      for (const [token, status] of allTokenStatus.entries()) {
        let tokenScore = 0;
        
        if (status.isAvailable) {
          // Available token: score based on remaining requests
          tokenScore = status.remaining;
        } else {
          // Unavailable token: score based on time until reset
          const timeUntilReset = status.resetTime.getTime() - now.getTime();
          if (timeUntilReset <= 0) {
            // Token has reset, mark it as available
            status.isAvailable = true;
            status.remaining = status.limit;
            tokenScore = status.limit;
          } else {
            // Token will reset soon: score inversely proportional to wait time
            const minutesUntilReset = Math.max(1, timeUntilReset / (1000 * 60));
            tokenScore = Math.floor(status.limit / minutesUntilReset);
          }
        }

        // Only switch if the token has significantly better score (20% improvement)
        if (tokenScore > bestScore * 1.2) {
          bestToken = token;
          bestScore = tokenScore;
        }
      }

      if (bestToken !== this.currentToken) {
        console.log(`Found better token with score ${bestScore} (current: ${remaining}). Rotating...`);
        this.tokenManager.rotateToNextAvailableToken(); // This will set the best token as current
        this.updateOctokitToken(bestToken);
        console.log('Successfully rotated to token with better availability');
      } else {
        // No significantly better token available
        console.log(`No significantly better token available. Continuing with current token...`);
      }
    } else if (remaining <= 20) {
      // Getting low - add small delay
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

        // For rate limit errors, try to rotate tokens
        const errorWithStatus = error as {
          status?: number;
          response?: { headers?: Record<string, string> };
        };
        if (errorWithStatus.status === 403 || errorWithStatus.status === 429) {
          console.log(`Rate limit error (${errorWithStatus.status}) - attempting token rotation...`);

          // Mark current token as unavailable
          this.tokenManager.updateTokenStatus(this.currentToken, {
            remaining: 0,
            limit: 5000,
            resetTime: new Date(),
          });

          // Check if we have multiple tokens
          const allTokenStatus = this.tokenManager.getAllTokenStatus();
          const totalTokens = allTokenStatus.size;

          if (totalTokens === 1) {
            // Single token scenario - must wait for reset
            console.log(`Single token configuration. Waiting for rate limit reset...`);
          } else {
            // Multiple tokens - try to find a better one
            const nextToken = this.tokenManager.findBestAvailableToken();
            if (nextToken && nextToken !== this.currentToken) {
              this.updateOctokitToken(nextToken);
              console.log('Successfully rotated to next available token, retrying...');
              continue; // Retry the request with new token
            }
          }

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
              console.log(`All tokens exhausted. Waiting ${secondsUntilReset} seconds for rate limit reset...`);
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
    })) as Array<{ org: string; user: string; user_id: number; '@timestamp': string }>;

    data = data.filter((x) => ['fmgl-internal', 'fmgl', 'fmgl-specialised'].includes(x.org));
    console.log(`Fetched ${data.length} audit log events`);
    console.log(JSON.stringify(data));

    return data.map((x) => ({
      user: x.user,
      user_id: x.user_id,
      created_at: x['@timestamp'],
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
      console.log('Author parameter is empty, skipping commit search');
      return [];
    }
    
    if (!orgName || !orgName.trim()) {
      console.log('Organization parameter is empty, skipping commit search');
      return [];
    }
    
    // Construct search query with actual search text
    const searchQuery = `${author} author:${author} org:${orgName} sort:committer-date-asc`;
    
    const { data: commits } = await this.makeRequestWithRetry(() =>
      this.octokit.request('GET /search/commits ', {
        q: searchQuery,
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
    
    // Validate input parameters
    if (!author || !author.trim()) {
      console.log('Author parameter is empty, skipping pull request search');
      return [];
    }
    
    if (!orgName || !orgName.trim()) {
      console.log('Organization parameter is empty, skipping pull request search');
      return [];
    }
    
    // Construct search query with actual search text
    const searchQuery = `${author} author:${author} org:${orgName} is:pr`;
    
    const { data: pulls } = await this.makeRequestWithRetry(() =>
      this.octokit.search.issuesAndPullRequests({
        q: searchQuery,
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
    
    try {
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
    } catch (error: any) {
      if (error.status === 404) {
        console.error(`Repository not found or no access: ${owner}/${repo}. Status: ${error.status}`);
        console.error(`This could be due to:`);
        console.error(`1. Repository doesn't exist`);
        console.error(`2. GitHub token doesn't have access to this repository`);
        console.error(`3. Repository name or owner is incorrect`);
        console.error(`4. Repository is private and token lacks permissions`);
        return [];
      } else if (error.status === 403) {
        console.error(`Access denied to repository: ${owner}/${repo}. Status: ${error.status}`);
        console.error(`This could be due to insufficient permissions or rate limiting`);
        return [];
      } else {
        console.error(`Error fetching pull requests for ${owner}/${repo}:`, error.message || error);
        throw error; // Re-throw other errors to be handled by the retry mechanism
      }
    }
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
 * Supports both single token (backward compatibility) and multiple tokens (comma-separated)
 */
export function createGitHubClient(authToken: string): GitHubClient {
  // Check if the token contains commas (multiple tokens)
  if (authToken.includes(',')) {
    const tokens = authToken.split(',').map(token => token.trim()).filter(token => token.length > 0);
    if (tokens.length === 0) {
      throw new Error('At least one valid GitHub token is required');
    }
    console.log(`Initializing GitHub client with ${tokens.length} tokens for rotation`);
    return new GitHubClient(tokens);
  } else {
    // Single token (backward compatibility)
    return new GitHubClient([authToken]);
  }
}
