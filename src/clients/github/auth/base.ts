import type { Octokit } from '@octokit/rest';
import type { Logger } from 'pino';

export abstract class GitHubAuth {
  abstract getToken(): Promise<string>;
  abstract isTokenValid(): boolean;
  abstract getOctokit(): Promise<Octokit>;
  abstract makeRequest<T>(requestFn: (octokit: Octokit) => Promise<T>, logger: Logger): Promise<T>;
  abstract waitForRateLimitReset(secondsUntilReset?: number): Promise<void>;

  /**
   * Extract rate limit information from API response headers
   */
  protected extractRateLimitInfo(response: any): { remaining: number; reset: number } | null {
    if (!response || typeof response !== 'object') return null;

    // Check if response has headers property
    const headers = response.headers || response.response?.headers;
    if (!headers) return null;

    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (remaining !== undefined && reset !== undefined) {
      return {
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10) * 1000, // Convert to milliseconds
      };
    }

    return null;
  }

  /**
   * Check rate limits and log status
   */
  async checkRateLimits(logger: Logger): Promise<void> {
    const octokit = await this.getOctokit();
    const result = await octokit.rest.rateLimit.get();

    // Extract and log rate limit info
    const rateLimitData = (result as any).data;
    if (rateLimitData?.rate) {
      logger.info(
        {
          remaining: rateLimitData.rate.remaining,
          limit: rateLimitData.rate.limit,
          reset: new Date(rateLimitData.rate.reset * 1000).toISOString(),
        },
        `Rate limit: ${rateLimitData.rate.remaining}/${rateLimitData.rate.limit} remaining, resets at ${new Date(rateLimitData.rate.reset * 1000).toISOString()}`
      );
    }
  }
}
