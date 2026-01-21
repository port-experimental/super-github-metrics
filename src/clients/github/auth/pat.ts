import { Octokit } from "@octokit/rest";
import type { Logger } from "pino";
import { GitHubAuth } from "./base";
import { PATTokenManager } from "./token_manager";

export class PATAuth extends GitHubAuth {
  private tokenManager: PATTokenManager;
  private currentOctokit: Octokit | null = null;
  private currentToken: string | null = null;
  private logger: Logger;

  constructor(tokens: string | string[], logger: Logger) {
    super();
    this.logger = logger;
    const tokenArray = Array.isArray(tokens)
      ? tokens
      : tokens.split(",").map((t) => t.trim());
    this.tokenManager = new PATTokenManager(tokenArray);
  }

  async getToken(): Promise<string> {
    const token = this.tokenManager.getBestToken();
    this.currentToken = token;
    return token;
  }

  isTokenValid(): boolean {
    return this.currentToken !== null && this.tokenManager.hasAvailableTokens();
  }

  async getOctokit(): Promise<Octokit> {
    const token = await this.getToken();

    // Create new Octokit instance with the selected token
    this.currentOctokit = new Octokit({
      auth: token,
      baseUrl: process.env.X_GITHUB_ENTERPRISE
        ? `https://${process.env.X_GITHUB_ENTERPRISE}/api/v3`
        : "https://api.github.com",
    });

    return this.currentOctokit;
  }

  /**
   * Updates rate limits for the current token
   */
  updateRateLimits(remaining: number, reset: number): void {
    if (this.currentToken) {
      this.tokenManager.updateRateLimits(this.currentToken, remaining, reset);
    }
  }

  /**
   * Rotates to the next available token
   */
  rotateToken(): void {
    this.currentToken = this.tokenManager.getNextToken();
    this.currentOctokit = null; // Force recreation of Octokit instance
  }

  /**
   * Gets rate limit status for all tokens
   */
  getRateLimitStatus(): Array<{
    token: string;
    remaining: number;
    reset: Date;
  }> {
    return this.tokenManager.getRateLimitStatus();
  }

  /**
   * Gets the number of available tokens
   */
  getTokenCount(): number {
    return this.tokenManager.getTokenCount();
  }

  /**
   * Wait for rate limit reset (PAT-specific - handles multiple tokens)
   */
  async waitForRateLimitReset(secondsUntilReset?: number): Promise<void> {
    let waitTime = secondsUntilReset || 3600; // Default to 1 hour if not specified

    // Find the token with the earliest reset time
    const tokenStatus = this.getRateLimitStatus();
    const now = Date.now();
    const earliestReset = Math.min(
      ...tokenStatus.map((status) => status.reset.getTime()),
    );
    waitTime = Math.max(0, Math.ceil((earliestReset - now) / 1000));

    if (waitTime > 0) {
      this.logger.info(
        { waitTime },
        `Waiting ${waitTime} seconds for rate limit reset...`,
      );

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
            this.logger.info(
              { remainingMinutes: Math.ceil(remainingTime / 60) },
              `Rate limit reset in progress: ${Math.ceil(remainingTime / 60)} minutes remaining...`,
            );
          }
        }
      }

      this.logger.info("Rate limit reset complete. Continuing...");
    }
  }

  /**
   * Makes a request with automatic token rotation for PAT authentication
   */
  async makeRequest<T>(
    requestFn: (octokit: Octokit) => Promise<T>,
    logger: Logger,
  ): Promise<T> {
    let lastError: Error | null = null;
    let tokenRotationAttempts = 0;
    const maxTokenRotations = this.getTokenCount();
    const maxRetries = 3; // Maximum retries for non-rate-limit errors

    while (tokenRotationAttempts < maxTokenRotations) {
      // Try the current token with retries for non-rate-limit errors
      for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt++) {
        try {
          const octokit = await this.getOctokit();
          const result = await requestFn(octokit);

          // Update rate limits using response headers
          const rateLimitInfo = this.extractRateLimitInfo(result);
          if (rateLimitInfo) {
            this.updateRateLimits(rateLimitInfo.remaining, rateLimitInfo.reset);
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

            logger.warn(
              { secondsUntilReset },
              `Rate limit exceeded. Reset in ${secondsUntilReset} seconds.`,
            );

            // Try token rotation first
            if (tokenRotationAttempts < maxTokenRotations - 1) {
              logger.info("Attempting token rotation...");
              this.rotateToken();
              tokenRotationAttempts++;
              break; // Break out of retry loop to try next token
            } else {
              // All tokens exhausted, wait for the token with earliest reset
              logger.info(
                "All tokens exhausted. Waiting for rate limit reset...",
              );
              await this.waitForRateLimitReset();
              tokenRotationAttempts = 0; // Reset attempts and try again
              break; // Break out of retry loop to start fresh
            }
          }

          // For other errors, implement exponential backoff and retry
          if (retryAttempt < maxRetries - 1) {
            const delay = Math.min(1000 * Math.pow(2, retryAttempt), 30000); // Max 30 seconds
            logger.warn(
              { attempt: retryAttempt + 1, maxRetries, delay },
              `Request failed (attempt ${retryAttempt + 1}/${maxRetries}). Retrying in ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Continue retry loop
          }

          // If max retries exceeded for non-rate-limit error, throw
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Request failed after all attempts");
  }
}
