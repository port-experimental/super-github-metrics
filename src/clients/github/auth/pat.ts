import { Octokit } from "@octokit/rest";
import { GitHubAuth } from "./base";
import { PATTokenManager } from "./token_manager";

export class PATAuth extends GitHubAuth {
  private tokenManager: PATTokenManager;
  private currentOctokit: Octokit | null = null;
  private currentToken: string | null = null;

  constructor(tokens: string | string[]) {
    super();
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
}