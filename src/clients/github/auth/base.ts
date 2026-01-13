import { Octokit } from "@octokit/rest";

export abstract class GitHubAuth {
  abstract getToken(): Promise<string>;
  abstract isTokenValid(): boolean;
  abstract getOctokit(): Promise<Octokit>;
}