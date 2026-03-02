import _ from "lodash";
import { createGitHubClient, type GitHubClient } from "../clients/github";
import { upsertEntitiesInBatches } from "../clients/port";
import type {
  Repository,
  PullRequestBasic,
  GitHubAppConfig,
} from "../clients/github/types";
import type { PortEntity } from "../clients/port/types";
import {
  CONCURRENCY_LIMITS,
  filterDataForTimePeriod,
  TIME_PERIODS,
  type TimePeriod,
} from "./utils";

export interface PRMetrics {
  repoId: string;
  repoName: string;
  prNumber: number;
  pullRequestId: string;
  // PR Size: Sum(lines added + lines deleted)
  prSize: number;
  // PR Lifetime: (PR close timestamp) - (PR creation timestamp) in days
  prLifetime: number | null;
  // PR Pickup Time: (First review timestamp) - (PR creation timestamp) in days
  prPickupTime: number | null;
  // PR Approve Time: (First approval timestamp) - (First review timestamp) in days
  prApproveTime: number | null;
  // PR Merge Time: (PR merge timestamp) - (First approval timestamp) in days
  prMergeTime: number | null;
  // PR Maturity: Ratio of changes added after PR publication vs total changes (0.0 to 1.0)
  prMaturity: number | null;
  // PR Success Rate: (# of merged PRs / total # of closed PRs) × 100
  prSuccessRate: number;
  // Review Participation: Average reviewers per PR
  reviewParticipation: number;
  prAdditions: number;
  prDeletions: number;
  prFilesChanged: number;
  comments: number;
  reviewComments: number;
  // PR First Comment: (First review timestamp)
  prFirstComment: string | null;
  // PR First Approval: (First approval timestamp)
  prFirstApproval: string | null;
  // Number of changes after PR is opened
  numberOfLineChangesAfterPRIsOpened: number | null;
  numberOfCommitsAfterPRIsOpened: number | null;
}

export const getNumberOfChangesAfterPRIsOpened = async (
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  prCreationDate: Date,
): Promise<{
  numberOfLineChangesAfterPRIsOpened: number | null;
  numberOfCommitsAfterPRIsOpened: number | null;
}> => {
  try {
    const commits = await githubClient.getPullRequestCommits(
      owner,
      repo,
      prNumber,
    );
    const commitsAfterPR = commits.filter((commit) => {
      const commitDate = new Date(commit.commit.author?.date || "");
      return commitDate > prCreationDate;
    });

    const numberOfLineChangesAfterPRIsOpened = commitsAfterPR.reduce(
      (total, commit) => {
        return total + (commit.stats?.total || 0);
      },
      0,
    );

    return {
      numberOfLineChangesAfterPRIsOpened,
      numberOfCommitsAfterPRIsOpened: commitsAfterPR.length,
    };
  } catch (error) {
    console.error(
      `Error getting changes after PR ${prNumber} is opened:`,
      error,
    );
    return {
      numberOfLineChangesAfterPRIsOpened: null,
      numberOfCommitsAfterPRIsOpened: null,
    };
  }
};

export async function fetchRepositoryPRs(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number,
): Promise<PullRequestBasic[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const allPRs: PullRequestBasic[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const prs = await githubClient.getPullRequests(owner, repoName, {
        state: "closed",
        sort: "created",
        direction: "desc",
        per_page: 100,
        page: page,
      });

      // Filter PRs created after the cutoff date
      const filteredPRs = prs.filter((pr) => {
        const prDate = new Date(pr.created_at);
        return prDate >= cutoffDate;
      });

      allPRs.push(...filteredPRs);

      // If we got less than 100 PRs or all PRs are before the cutoff date, we've reached the end
      if (prs.length < 100 || filteredPRs.length === 0) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(
        `Error fetching PRs for ${owner}/${repoName} page ${page}:`,
        error,
      );
      hasMore = false;
    }
  }

  return allPRs;
}

export async function calculateAndStorePRMetrics(
  repos: Repository[],
  githubClient: GitHubClient,
): Promise<void> {
  let hasFatalError = false;
  const failedRepos: string[] = [];
  const allEntities: PortEntity[] = [];

  // Process repositories concurrently with a reasonable concurrency limit
  const concurrencyLimit = CONCURRENCY_LIMITS.REPOSITORIES; // Use the global constant
  const results: Array<{
    success: boolean;
    repoName: string;
    error?: any;
    entities?: PortEntity[];
  }> = [];

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit);
    console.log(
      `Processing PR metrics batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(repos.length / concurrencyLimit)} (${batch.length} repos)`,
    );

    const batchPromises = batch.map(async (repo, batchIndex) => {
      const repoIndex = i + batchIndex;
      try {
        console.log(
          `Processing repo ${repo.name} (${repoIndex + 1}/${repos.length})`,
        );

        // Fetch all PRs for the maximum time period (90 days) once
        const maxPeriod = TIME_PERIODS.NINETY_DAYS;
        console.log(`  Fetching PRs for ${maxPeriod} day period...`);
        const allPRs = await fetchRepositoryPRs(
          githubClient,
          repo.owner.login,
          repo.name,
          maxPeriod,
        );
        console.log(
          `  Found ${allPRs.length} PRs in the last ${maxPeriod} days`,
        );
        const repoTotalPRs = allPRs.length;
        const repoTotalMergedPRs = allPRs.filter((pr) => !!pr.merged_at).length;

        // Process each time period by filtering the already-fetched data
        const timePeriods: TimePeriod[] = [
          TIME_PERIODS.ONE_DAY,
          TIME_PERIODS.SEVEN_DAYS,
          TIME_PERIODS.THIRTY_DAYS,
          TIME_PERIODS.NINETY_DAYS,
        ];

        const repoEntities: PortEntity[] = [];
        const seenEntityIdentifiers = new Set<string>();

        // Process all time periods concurrently
        const timePeriodPromises = timePeriods.map(async (period) => {
          console.log(`  Processing ${period} day period...`);

          // Filter PRs for this time period
          const periodPRs = filterDataForTimePeriod(allPRs, period);
          console.log(
            `  Filtered to ${periodPRs.length} PRs for ${period} day period`,
          );

          // Process PRs concurrently within each time period
          // Note: This uses CONCURRENCY_LIMITS.API_CALLS_PER_ITEM (3) concurrent API calls per PR
          const prProcessingPromises = periodPRs.map(async (pr) => {
            try {
              // Run all API calls for this PR concurrently
              const [prData, reviews, changesAfterPR] = await Promise.all([
                githubClient.getPullRequest(
                  repo.owner.login,
                  repo.name,
                  pr.number,
                ),
                githubClient.getPullRequestReviews(
                  repo.owner.login,
                  repo.name,
                  pr.number,
                ),
                getNumberOfChangesAfterPRIsOpened(
                  githubClient,
                  repo.owner.login,
                  repo.name,
                  pr.number,
                  new Date(pr.created_at),
                ),
              ]);

              const prFirstApproval =
                reviews.find((review) => review.state === "APPROVED")
                  ?.submitted_at || null;

              const record: PRMetrics = {
                repoId: repo.id.toString(),
                repoName: repo.name,
                prNumber: pr.number,
                pullRequestId: pr.id.toString(),
                prSize: prData.additions + prData.deletions,
                prAdditions: prData.additions,
                prDeletions: prData.deletions,
                prFilesChanged: prData.changed_files,
                prFirstComment: reviews[0]?.submitted_at || null,
                prFirstApproval,
                ...changesAfterPR,
                // times expressed in days
                prLifetime:
                  pr.closed_at && pr.created_at
                    ? (new Date(pr.closed_at).getTime() -
                        new Date(pr.created_at).getTime()) /
                      (1000 * 60 * 60 * 24)
                    : null,
                prPickupTime:
                  reviews.length > 0 && reviews[0].submitted_at && pr.created_at
                    ? (new Date(reviews[0].submitted_at).getTime() -
                        new Date(pr.created_at).getTime()) /
                      (1000 * 60 * 60 * 24)
                    : null,
                prApproveTime:
                  reviews.length > 0 &&
                  reviews[0].submitted_at &&
                  prFirstApproval
                    ? (new Date(prFirstApproval).getTime() -
                        new Date(reviews[0].submitted_at).getTime()) /
                      (1000 * 60 * 60 * 24)
                    : null,
                prMergeTime:
                  pr.merged_at && prFirstApproval
                    ? (new Date(pr.merged_at).getTime() -
                        new Date(prFirstApproval).getTime()) /
                      (1000 * 60 * 60 * 24)
                    : null,
                prMaturity: changesAfterPR.numberOfLineChangesAfterPRIsOpened
                  ? changesAfterPR.numberOfLineChangesAfterPRIsOpened /
                    (prData.additions + prData.deletions)
                  : null,
                prSuccessRate: pr.merged_at ? 100 : 0,
                reviewParticipation: reviews.length,
                comments: prData.comments,
                reviewComments: prData.review_comments,
              };
              return record;
            } catch (error) {
              console.error(
                `Error processing PR ${pr.number} in ${repo.name}:`,
                error,
              );
              return null;
            }
          });

          // Process PRs with concurrency limit
          const prResults = await Promise.all(prProcessingPromises);
          const validPRResults = prResults.filter(
            (result) => result !== null,
          ) as PRMetrics[];

          if (validPRResults.length === 0) {
            console.log(`  No valid PR metrics for ${period} day period`);
            return;
          }

          // Create Port entities for each PR (matches githubPullRequest schema)
          const entities: PortEntity[] = validPRResults.map((prMetric) => ({
            identifier: `${repo.name}${prMetric.prNumber}`,
            title: `${repo.name} #${prMetric.prNumber}`,
            properties: {
              pr_size: prMetric.prSize,
              total_prs: repoTotalPRs,
              total_merged_prs: repoTotalMergedPRs,
              pr_lifetime: prMetric.prLifetime,
              pr_pickup_time: prMetric.prPickupTime,
              pr_approve_time: prMetric.prApproveTime,
              pr_merge_time: prMetric.prMergeTime,
              pr_maturity: prMetric.prMaturity,
              pr_success_rate: prMetric.prSuccessRate,
              review_participation: prMetric.reviewParticipation,
              number_of_line_changes_after_pr_is_opened:
                prMetric.numberOfLineChangesAfterPRIsOpened,
              number_of_commits_after_pr_is_opened:
                prMetric.numberOfCommitsAfterPRIsOpened,
            },
            relations: {
              service: repo.name,
            },
          }));
          const uniqueEntities = entities.filter((entity) => {
            if (!entity.identifier || seenEntityIdentifiers.has(entity.identifier)) {
              return false;
            }
            seenEntityIdentifiers.add(entity.identifier);
            return true;
          });
          repoEntities.push(...uniqueEntities);
        });

        await Promise.all(timePeriodPromises);

        return { success: true, repoName: repo.name, entities: repoEntities };
      } catch (error) {
        console.error(`Error processing repo ${repo.name}:`, error);
        return { success: false, repoName: repo.name, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add a small delay between batches to be conservative with rate limits
    if (i + concurrencyLimit < repos.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Process results
  for (const result of results) {
    if (result.success && result.entities) {
      allEntities.push(...result.entities);
    } else {
      failedRepos.push(result.repoName);
      hasFatalError = true;
    }
  }

  // Store all entities in batches
  if (allEntities.length > 0) {
    console.log(`Storing ${allEntities.length} PR metrics entities...`);
    await storePRMetricsEntities(allEntities);
    console.log("Successfully stored PR metrics entities");
  }

  // Print summary
  console.log("\n=== PR Metrics Processing Summary ===");
  console.log(`Total repositories processed: ${results.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`Failed: ${failedRepos.length}`);
  console.log(`Total entities created: ${allEntities.length}`);

  if (failedRepos.length > 0) {
    console.log("\nFailed repositories:");
    failedRepos.forEach((repoName) => console.log(`- ${repoName}`));
  }

  if (hasFatalError) {
    throw new Error(
      "Failed to process PR metrics for one or more repositories",
    );
  }
}

/**
 * Stores multiple PR metrics entities in Port using bulk ingestion
 */
export async function storePRMetricsEntities(
  entities: PortEntity[],
): Promise<void> {
  if (entities.length === 0) {
    console.log("No PR metrics entities to store");
    return;
  }

  try {
    console.log(
      `Storing ${entities.length} PR metrics entities using bulk ingestion...`,
    );
    const results = await upsertEntitiesInBatches(
      "githubPullRequest",
      entities,
    );

    // Aggregate results:
    // - `created=true` => newly created entities
    // - `created=false` with no API error => updated entities (still successful upserts)
    const totalCreated = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => r.created).length,
      0,
    );
    const totalProcessed = results.reduce(
      (sum, result) => sum + result.entities.length,
      0,
    );
    const totalUpdated = totalProcessed - totalCreated;
    const totalFailed = results.reduce(
      (sum, result) => sum + (result.errors ? result.errors.length : 0),
      0,
    );

    console.log(
      `Bulk ingestion completed: ${totalCreated} created, ${totalUpdated} updated, ${totalFailed} failed`,
    );

    if (totalFailed > 0) {
      const failedIdentifiers = results.flatMap((result) =>
        (result.errors || []).map((error) => error.identifier),
      );
      console.warn(`Failed entities: ${failedIdentifiers.join(", ")}`);

      const errors = results.flatMap((result) => result.errors || []);
      if (errors.length > 0) {
        console.warn("Detailed error information:");
        errors.forEach((error) => {
          console.warn(
            `  - ${error.identifier}: ${error.message} (${error.statusCode})`,
          );
        });
      }
    }
  } catch (error) {
    console.error(
      `Failed to store PR metrics entities: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}
