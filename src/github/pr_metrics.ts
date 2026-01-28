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
  createCutoffDate,
} from "./utils";
import { getLogger } from "../logger";
import { GITHUB_PAGE_SIZE, PR_METRICS_BATCH_DELAY_MS } from "../constants";
import {
  safePercentage,
  safeDivide,
  safeStandardDeviation,
  sanitizeMetric,
} from "../utils/metrics-validation";

// Module logger
const logger = getLogger().child({ module: "pr-metrics" });

export interface PRMetrics {
  repoId: string;
  repoName: string;
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

/**
 * Gets the number of changes made after a PR was opened.
 * Calculates both line changes and commit counts.
 *
 * @param githubClient - GitHub client instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param prCreationDate - Date when the PR was created
 * @returns Object containing line changes and commit counts after PR opened
 */
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
    logger.error(
      { owner, repo, prNumber, error: error instanceof Error ? error.message : "Unknown error" },
      "Error getting changes after PR is opened",
    );
    return {
      numberOfLineChangesAfterPRIsOpened: null,
      numberOfCommitsAfterPRIsOpened: null,
    };
  }
};

/**
 * Fetches all PRs for a repository within the specified time period.
 *
 * @param githubClient - GitHub client instance
 * @param owner - Repository owner
 * @param repoName - Repository name
 * @param daysBack - Number of days to look back
 * @returns Array of basic PR data within the time period
 */
export async function fetchRepositoryPRs(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number,
): Promise<PullRequestBasic[]> {
  const cutoffDate = createCutoffDate(daysBack);

  const allPRs: PullRequestBasic[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const prs = await githubClient.getPullRequests(owner, repoName, {
        state: "closed",
        sort: "created",
        direction: "desc",
        per_page: GITHUB_PAGE_SIZE,
        page: page,
      });

      // Filter PRs created after the cutoff date
      const filteredPRs = prs.filter((pr) => {
        const prDate = new Date(pr.created_at);
        return prDate >= cutoffDate;
      });

      allPRs.push(...filteredPRs);

      // If we got less than page size PRs or all PRs are before the cutoff date, we've reached the end
      if (prs.length < GITHUB_PAGE_SIZE || filteredPRs.length === 0) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      logger.error(
        { owner, repoName, page, error: error instanceof Error ? error.message : "Unknown error" },
        "Error fetching PRs",
      );
      hasMore = false;
    }
  }

  return allPRs;
}

interface AggregatedMetrics {
  totalPRs: number;
  totalMergedPRs: number;
  numberOfPRsReviewed: number;
  numberOfPRsMergedWithoutReview: number;
  percentageOfPRsReviewed: number;
  percentageOfPRsMergedWithoutReview: number;
  averageTimeToFirstReview: number;
  prSuccessRate: number;
  contributionStandardDeviation: number;
}

/**
 * Calculates aggregated metrics from individual PR metrics.
 * Uses safe math operations to prevent NaN/Infinity results.
 *
 * @param prMetrics - Array of individual PR metrics
 * @param period - Time period in days (unused but kept for API compatibility)
 * @returns Aggregated metrics with validated values
 */
function calculateAggregatedMetrics(
  prMetrics: PRMetrics[],
  period: number,
): AggregatedMetrics {
  const totalPRs = prMetrics.length;
  const totalMergedPRs = prMetrics.filter(
    (pr) => pr.prSuccessRate === 100,
  ).length;
  const numberOfPRsReviewed = prMetrics.filter(
    (pr) => pr.reviewParticipation > 0,
  ).length;
  const numberOfPRsMergedWithoutReview = Math.max(0, totalMergedPRs - numberOfPRsReviewed);

  const percentageOfPRsReviewed = safePercentage(numberOfPRsReviewed, totalPRs);
  const percentageOfPRsMergedWithoutReview = safePercentage(
    numberOfPRsMergedWithoutReview,
    totalMergedPRs
  );

  const validPickupTimes = prMetrics
    .filter((pr) => pr.prPickupTime !== null)
    .map((pr) => pr.prPickupTime!);
  const averageTimeToFirstReview = sanitizeMetric(
    safeDivide(
      validPickupTimes.reduce((sum, time) => sum + time, 0),
      validPickupTimes.length
    )
  );

  const prSuccessRate = safePercentage(totalMergedPRs, totalPRs);

  // Calculate standard deviation of contributions (PR sizes)
  const prSizes = prMetrics.map((pr) => pr.prSize);
  const contributionStandardDeviation = safeStandardDeviation(prSizes);

  return {
    totalPRs,
    totalMergedPRs,
    numberOfPRsReviewed,
    numberOfPRsMergedWithoutReview,
    percentageOfPRsReviewed,
    percentageOfPRsMergedWithoutReview,
    averageTimeToFirstReview,
    prSuccessRate,
    contributionStandardDeviation,
  };
}

/**
 * Main function to calculate and store PR metrics for multiple repositories.
 *
 * @param repos - Array of repositories to process
 * @param githubClient - GitHub client instance
 */
export async function calculateAndStorePRMetrics(
  repos: Repository[],
  githubClient: GitHubClient,
): Promise<void> {
  let hasFatalError = false;
  const failedRepos: string[] = [];
  const allEntities: PortEntity[] = [];

  // Process repositories concurrently with a reasonable concurrency limit
  const concurrencyLimit = CONCURRENCY_LIMITS.REPOSITORIES;
  const results: Array<{
    success: boolean;
    repoName: string;
    error?: unknown;
    entities?: PortEntity[];
  }> = [];
  const totalBatches = Math.ceil(repos.length / concurrencyLimit);

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit);
    const batchNumber = Math.floor(i / concurrencyLimit) + 1;

    logger.info(
      { batchNumber, totalBatches, batchSize: batch.length },
      "Processing PR metrics batch",
    );

    const batchPromises = batch.map(async (repo, batchIndex) => {
      const repoIndex = i + batchIndex;
      try {
        logger.info(
          { repoName: repo.name, repoIndex: repoIndex + 1, totalRepos: repos.length },
          "Processing repository",
        );

        // Fetch all PRs for the maximum time period (90 days) once
        const maxPeriod = TIME_PERIODS.NINETY_DAYS;
        logger.debug(
          { repoName: repo.name, maxPeriod },
          "Fetching PRs for maximum period",
        );
        const allPRs = await fetchRepositoryPRs(
          githubClient,
          repo.owner.login,
          repo.name,
          maxPeriod,
        );
        logger.debug(
          { repoName: repo.name, prCount: allPRs.length, maxPeriod },
          "Found PRs",
        );

        // Process each time period by filtering the already-fetched data
        const timePeriods: TimePeriod[] = [
          TIME_PERIODS.ONE_DAY,
          TIME_PERIODS.SEVEN_DAYS,
          TIME_PERIODS.THIRTY_DAYS,
          TIME_PERIODS.NINETY_DAYS,
        ];

        const repoEntities: PortEntity[] = [];

        // Process all time periods concurrently
        const timePeriodPromises = timePeriods.map(async (period) => {
          logger.debug(
            { repoName: repo.name, period },
            "Processing time period",
          );

          // Filter PRs for this time period
          const periodPRs = filterDataForTimePeriod(allPRs, period);
          logger.debug(
            { repoName: repo.name, period, prCount: periodPRs.length },
            "Filtered PRs for period",
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
              logger.error(
                { repoName: repo.name, prNumber: pr.number, error: error instanceof Error ? error.message : "Unknown error" },
                "Error processing PR",
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
            logger.debug(
              { repoName: repo.name, period },
              "No valid PR metrics for period",
            );
            return;
          }

          // Calculate aggregated metrics for this time period
          const aggregatedMetrics = calculateAggregatedMetrics(
            validPRResults,
            period,
          );

          // Create Port entity for this time period
          const entity: PortEntity = {
            identifier: `${repo.name}-${period}-pr-metrics`,
            title: `${repo.name} PR Metrics (${period} days)`,
            properties: {
              period: period.toString(),
              period_type: "daily",
              total_prs: aggregatedMetrics.totalPRs,
              total_merged_prs: aggregatedMetrics.totalMergedPRs,
              number_of_prs_reviewed: aggregatedMetrics.numberOfPRsReviewed,
              number_of_prs_merged_without_review:
                aggregatedMetrics.numberOfPRsMergedWithoutReview,
              percentage_of_prs_reviewed:
                aggregatedMetrics.percentageOfPRsReviewed,
              percentage_of_prs_merged_without_review:
                aggregatedMetrics.percentageOfPRsMergedWithoutReview,
              average_time_to_first_review:
                aggregatedMetrics.averageTimeToFirstReview,
              pr_success_rate: aggregatedMetrics.prSuccessRate,
              contribution_standard_deviation:
                aggregatedMetrics.contributionStandardDeviation,
              calculated_at: new Date().toISOString(),
              data_source: "github",
            },
            relations: {
              service: repo.name,
            },
          };

          repoEntities.push(entity);
        });

        await Promise.all(timePeriodPromises);

        return { success: true, repoName: repo.name, entities: repoEntities };
      } catch (error) {
        logger.error(
          { repoName: repo.name, error: error instanceof Error ? error.message : "Unknown error" },
          "Error processing repository",
        );
        return { success: false, repoName: repo.name, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add a small delay between batches to be conservative with rate limits
    if (i + concurrencyLimit < repos.length) {
      await new Promise((resolve) => setTimeout(resolve, PR_METRICS_BATCH_DELAY_MS));
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
    logger.info(
      { entityCount: allEntities.length },
      "Storing PR metrics entities",
    );
    await storePRMetricsEntities(allEntities);
    logger.info("Successfully stored PR metrics entities");
  }

  // Print summary
  const successCount = results.filter((r) => r.success).length;
  logger.info(
    {
      totalRepositories: results.length,
      successful: successCount,
      failed: failedRepos.length,
      totalEntities: allEntities.length,
    },
    "PR Metrics Processing Summary",
  );

  if (failedRepos.length > 0) {
    logger.warn({ failedRepos }, "Failed repositories");
  }

  if (hasFatalError) {
    throw new Error(
      "Failed to process PR metrics for one or more repositories",
    );
  }
}

/**
 * Stores multiple PR metrics entities in Port using bulk ingestion.
 *
 * @param entities - Array of Port entities to store
 */
export async function storePRMetricsEntities(
  entities: PortEntity[],
): Promise<void> {
  if (entities.length === 0) {
    logger.info("No PR metrics entities to store");
    return;
  }

  try {
    logger.info(
      { entityCount: entities.length },
      "Storing PR metrics entities using bulk ingestion",
    );
    const results = await upsertEntitiesInBatches(
      "githubPullRequest",
      entities,
    );

    // Aggregate results - check both entities array and errors array
    const totalSuccessful = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => r.created).length,
      0,
    );
    const totalFailed = results.reduce((sum, result) => {
      const failedFromEntities = result.entities.filter(
        (r) => !r.created,
      ).length;
      const failedFromErrors = result.errors ? result.errors.length : 0;
      return sum + failedFromEntities + failedFromErrors;
    }, 0);

    logger.info(
      { successful: totalSuccessful, failed: totalFailed },
      "Bulk ingestion completed",
    );

    if (totalFailed > 0) {
      // Collect all failed entities from both sources
      const allFailed = results.flatMap((result) => {
        const failedFromEntities = result.entities.filter((r) => !r.created);
        const failedFromErrors = result.errors || [];
        return [...failedFromEntities, ...failedFromErrors];
      });

      const failedIdentifiers = allFailed.map((r) => r.identifier);
      logger.warn({ failedIdentifiers }, "Some entities failed to store");

      // Log detailed error information
      const errors = results.flatMap((result) => result.errors || []);
      if (errors.length > 0) {
        errors.forEach((error) => {
          logger.warn(
            { identifier: error.identifier, message: error.message, statusCode: error.statusCode },
            "Entity upsert error",
          );
        });
      }
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to store PR metrics entities",
    );
    throw error;
  }
}
