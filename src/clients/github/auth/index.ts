import type { Logger } from "pino";
import { GitHubAuthConfig } from "../types";
import { GitHubAppAuth } from "./app";
import { GitHubAuth } from "./base";
import { PATAuth } from "./pat";

export { GitHubAuth } from "./base";
export { PATAuth } from "./pat";

export function createGitHubAuth(
  { appId, privateKey, installationId, patTokens }: GitHubAuthConfig,
  logger: Logger,
): GitHubAuth {
  // Check for GitHub App configuration first (preferred method)
  if (appId && privateKey && installationId) {
    logger.info("Using GitHub App authentication");
    return new GitHubAppAuth(
      {
        appId,
        privateKey,
        installationId,
      },
      logger,
    );
  }

  // Fall back to PAT authentication
  if (patTokens) {
    logger.info("Using Personal Access Token authentication");
    return new PATAuth(patTokens, logger);
  }

  throw new Error(
    "No GitHub authentication configured. Please set either GitHub App credentials (X_GITHUB_APP_ID, X_GITHUB_APP_PRIVATE_KEY, X_GITHUB_APP_INSTALLATION_ID) or Personal Access Token (X_GITHUB_TOKEN)",
  );
}
