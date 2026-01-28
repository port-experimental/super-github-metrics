import { createAppAuth } from "@octokit/auth-app";
import type { Logger } from "pino";
import { Octokit } from "@octokit/rest";
import type { GitHubAppConfig } from "../types";
import { GitHubAuth } from "./base";
import {
  TOKEN_EXPIRY_BUFFER_MS,
  GITHUB_APP_TOKEN_EXPIRY_MS,
  DEFAULT_RATE_LIMIT_WAIT_SECONDS,
  RATE_LIMIT_WAIT_CHUNK_SECONDS,
  RATE_LIMIT_LOG_INTERVAL_CHUNKS,
  MAX_REQUEST_RETRIES,
  BASE_BACKOFF_DELAY_MS,
  MAX_BACKOFF_DELAY_MS,
} from "../../../constants";

export class GitHubAppAuth extends GitHubAuth {
  private appId: string;
  private privateKey: string;
  private installationId: string;
  private currentToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private logger: Logger;

  constructor(config: GitHubAppConfig, logger: Logger) {
    super();
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.installationId = config.installationId;
    this.logger = logger;
  }

  /**
   * Get a valid installation access token.
   * Generates a new token if the current one is expired or about to expire.
   *
   * @returns A valid GitHub App installation access token
   * @throws Error if token generation fails
   */
  async getToken(): Promise<string> {
    // Check if current token is still valid (with buffer)
    if (
      this.currentToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() > Date.now() + TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.currentToken;
    }

    // Generate new token
    const auth = createAppAuth({
      appId: this.appId,
      privateKey: this.privateKey,
    });

    const { token } = await auth({
      type: "installation",
      installationId: this.installationId,
    });

    if (!token) {
      throw new Error("Failed to generate installation access token");
    }

    this.currentToken = token;
    // GitHub App tokens typically expire in 1 hour
    this.tokenExpiry = new Date(Date.now() + GITHUB_APP_TOKEN_EXPIRY_MS);

    this.logger.info("Generated new GitHub App installation access token");
    return token;
  }

  /**
   * Check if current token is valid.
   * Returns false if token is missing, expired, or about to expire.
   *
   * @returns true if the token is valid and not about to expire
   */
  isTokenValid(): boolean {
    return !!(
      this.currentToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() > Date.now() + TOKEN_EXPIRY_BUFFER_MS
    );
  }

  /**
   * Get Octokit instance with valid token
   */
  async getOctokit(): Promise<Octokit> {
    const token = await this.getToken();
    return new Octokit({ auth: token });
  }

  /**
   * Wait for rate limit reset (for GitHub App auth).
   * Waits in chunks to allow for early termination and logs progress periodically.
   *
   * @param secondsUntilReset - Seconds to wait, defaults to DEFAULT_RATE_LIMIT_WAIT_SECONDS
   */
  async waitForRateLimitReset(secondsUntilReset?: number): Promise<void> {
    const waitTime = secondsUntilReset ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS;

    if (waitTime > 0) {
      this.logger.info(
        { waitTime },
        `Waiting ${waitTime} seconds for rate limit reset`,
      );

      // Wait in chunks to allow for early termination
      const chunkSize = Math.min(waitTime, RATE_LIMIT_WAIT_CHUNK_SECONDS);
      const chunks = Math.ceil(waitTime / chunkSize);

      for (let i = 0; i < chunks; i++) {
        const remainingTime = waitTime - i * chunkSize;
        const currentChunk = Math.min(chunkSize, remainingTime);

        if (currentChunk > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, currentChunk * 1000),
          );

          // Log progress at configured interval
          if (i % RATE_LIMIT_LOG_INTERVAL_CHUNKS === 0 && remainingTime > RATE_LIMIT_WAIT_CHUNK_SECONDS) {
            this.logger.info(
              { remainingMinutes: Math.ceil(remainingTime / 60) },
              `Rate limit reset in progress: ${Math.ceil(remainingTime / 60)} minutes remaining`,
            );
          }
        }
      }

      this.logger.info("Rate limit reset complete, continuing");
    }
  }

  /**
   * Makes a request with retry logic and rate limit handling.
   * Implements exponential backoff for transient failures.
   *
   * @param requestFn - The request function to execute
   * @param logger - Logger for request logging
   * @returns The result of the request
   * @throws The last error if all retries fail
   */
  async makeRequest<T>(
    requestFn: (octokit: Octokit) => Promise<T>,
    logger: Logger,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_REQUEST_RETRIES; attempt++) {
      try {
        const octokit = await this.getOctokit();
        return await requestFn(octokit);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorWithStatus = error as { status?: number; response?: { headers?: Record<string, string> } };

        // Check if it's a rate limit error
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.response?.headers?.["x-ratelimit-remaining"] === "0"
        ) {
          const resetTime = errorWithStatus.response?.headers?.["x-ratelimit-reset"];
          const secondsUntilReset = resetTime
            ? parseInt(resetTime, 10) - Math.floor(Date.now() / 1000)
            : 0;

          logger.warn(
            { secondsUntilReset },
            `Rate limit exceeded, reset in ${secondsUntilReset} seconds`,
          );
          await this.waitForRateLimitReset(secondsUntilReset);
          continue;
        }

        // For other errors, implement exponential backoff
        if (attempt < MAX_REQUEST_RETRIES - 1) {
          const delay = Math.min(
            BASE_BACKOFF_DELAY_MS * Math.pow(2, attempt),
            MAX_BACKOFF_DELAY_MS
          );
          logger.warn(
            { attempt: attempt + 1, maxRetries: MAX_REQUEST_RETRIES, delayMs: delay },
            `Request failed, retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }

    throw lastError || new Error("Request failed after all attempts");
  }
}
