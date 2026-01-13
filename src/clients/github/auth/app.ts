import { createAppAuth } from "@octokit/auth-app";
import { GitHubAppConfig } from "../types";
import { GitHubAuth } from "./base";
import { Octokit } from "@octokit/rest";

export class GitHubAppAuth extends GitHubAuth {
  private appId: string;
  private privateKey: string;
  private installationId: string;
  private currentToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: GitHubAppConfig) {
    super();
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.installationId = config.installationId;
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

    console.log("Generated new GitHub App installation access token");
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
}
