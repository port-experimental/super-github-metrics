import { GitHubAuthConfig } from "../types";
import { GitHubAppAuth } from "./app";
import { GitHubAuth } from "./base";
import { PATAuth } from "./pat";

export { GitHubAuth } from "./base";

export function createGitHubAuth({
  appId,
  privateKey,
  installationId,
  patTokens,
}: GitHubAuthConfig): GitHubAuth {
  // Check for GitHub App configuration first (preferred method)
  if (appId && privateKey && installationId) {
    console.log("Using GitHub App authentication");
    return new GitHubAppAuth({
      appId,
      privateKey,
      installationId,
    });
  }

  // Fall back to PAT authentication
  if (patTokens) {
    console.log("Using Personal Access Token authentication");
    return new PATAuth(patTokens);
  }

  throw new Error(
    "No GitHub authentication configured. Please set either GitHub App credentials (X_GITHUB_APP_ID, X_GITHUB_APP_PRIVATE_KEY, X_GITHUB_APP_INSTALLATION_ID) or Personal Access Token (X_GITHUB_TOKEN)",
  );
}
