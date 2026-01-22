import { createAppAuth } from "@octokit/auth-app";
import type { Logger } from "pino";
import { GitHubAppConfig } from "../types";
import { GitHubAuth } from "./base";
import { Octokit } from "@octokit/rest";

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
   * Get a valid installation access token
   */
  async getToken(): Promise<string> {
    // Check if current token is still valid (with 5 minute buffer)
    if (
      this.currentToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() > Date.now() + 5 * 60 * 1000
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
    this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    this.logger.info("Generated new GitHub App installation access token");
    return token;
  }

  /**
   * Check if current token is valid
   */
  isTokenValid(): boolean {
    return !!(
      this.currentToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() > Date.now() + 5 * 60 * 1000
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
   * Wait for rate limit reset (for GitHub App auth)
   */
  async waitForRateLimitReset(secondsUntilReset?: number): Promise<void> {
    const waitTime = secondsUntilReset || 3600; // Default to 1 hour if not specified

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
   * Makes a request with retry logic and rate limit handling
   */
  async makeRequest<T>(
    requestFn: (octokit: Octokit) => Promise<T>,
    logger: Logger,
  ): Promise<T> {
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const octokit = await this.getOctokit();
        return await requestFn(octokit);
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error
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
          logger.info("Waiting for rate limit reset...");
          await this.waitForRateLimitReset(secondsUntilReset);
          continue;
        }

        // For other errors, implement exponential backoff
        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          logger.warn(
            { attempt: attempt + 1, maxRetries, delay },
            `Request failed (attempt ${attempt + 1}/${maxRetries}). Retrying in ${delay}ms...`,
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
