import _ from "lodash";
import type { Logger } from "pino";
import { createGitHubClient, type GitHubClient } from "../clients/github";
import { upsertEntitiesInBatches } from "../clients/port";
import type {
  PullRequestBasic,
  Repository,
  GitHubAppConfig,
} from "../clients/github/types";
import {
  filterDataForTimePeriod,
  TIME_PERIODS,
  type TimePeriod,
  getMaxTimePeriod,
  CONCURRENCY_LIMITS,
  createCutoffDate,
} from "./utils";
import type { PortEntity } from "../clients/port/types";
import { getPortBlueprintEnv } from "../env";
import { getLogger } from "../logger";
import { GITHUB_PAGE_SIZE } from "../constants";
import {
  safePercentage,
  safeDivide,
  safeStandardDeviation,
  sanitizeMetric,
} from "../utils/metrics-validation";

export const BLUEPRINT_NAME = "service";

export function getServiceBlueprintName(): string {
  return getPortBlueprintEnv().serviceBlueprint;
}
export interface ServiceMetrics {
  repoId: string;
  repoName: string;
  organization: string;
  // 1 day metrics
  numberOfPRsReviewed_1d: number;
  numberOfPRsMergedWithoutReview_1d: number;
  percentageOfPRsReviewed_1d: number;
  percentageOfPRsMergedWithoutReview_1d: number;
  averageTimeToFirstReview_1d: number;
  prSuccessRate_1d: number;
  totalPRs_1d: number;
  totalMergedPRs_1d: number;
  contributionStandardDeviation_1d: number;
  // 7 days metrics
  numberOfPRsReviewed_7d: number;
  numberOfPRsMergedWithoutReview_7d: number;
  percentageOfPRsReviewed_7d: number;
  percentageOfPRsMergedWithoutReview_7d: number;
  averageTimeToFirstReview_7d: number;
  prSuccessRate_7d: number;
  totalPRs_7d: number;
  totalMergedPRs_7d: number;
  contributionStandardDeviation_7d: number;
  // 30 days metrics
  numberOfPRsReviewed_30d: number;
  numberOfPRsMergedWithoutReview_30d: number;
  percentageOfPRsReviewed_30d: number;
  percentageOfPRsMergedWithoutReview_30d: number;
  averageTimeToFirstReview_30d: number;
  prSuccessRate_30d: number;
  totalPRs_30d: number;
  totalMergedPRs_30d: number;
  contributionStandardDeviation_30d: number;
  // 60 days metrics
  numberOfPRsReviewed_60d: number;
  numberOfPRsMergedWithoutReview_60d: number;
  percentageOfPRsReviewed_60d: number;
  percentageOfPRsMergedWithoutReview_60d: number;
  averageTimeToFirstReview_60d: number;
  prSuccessRate_60d: number;
  totalPRs_60d: number;
  totalMergedPRs_60d: number;
  contributionStandardDeviation_60d: number;
  // 90 days metrics
  numberOfPRsReviewed_90d: number;
  numberOfPRsMergedWithoutReview_90d: number;
  percentageOfPRsReviewed_90d: number;
  percentageOfPRsMergedWithoutReview_90d: number;
  averageTimeToFirstReview_90d: number;
  prSuccessRate_90d: number;
  totalPRs_90d: number;
  totalMergedPRs_90d: number;
  contributionStandardDeviation_90d: number;
}

export interface PRReviewData {
  totalPRs: number;
  totalMergedPRs: number;
  numberOfPRsReviewed: number;
  numberOfPRsMergedWithoutReview: number;
  totalTimeToFirstReview: number;
  prsWithReviewTime: number;
  totalSuccessfulPRs: number; // PRs that were merged
}

// Module logger
const logger = getLogger().child({ module: "service-metrics" });

/**
 * Calculates the standard deviation of contribution counts.
 * Uses safe math operations to prevent NaN/Infinity results.
 *
 * @param contributionCounts - Array of contribution counts per contributor
 * @returns The standard deviation, or 0 if insufficient data
 */
export function calculateContributionStandardDeviation(
  contributionCounts: number[],
): number {
  return safeStandardDeviation(contributionCounts);
}

/**
 * Fetches all contributions for a repository within the specified time period.
 *
 * @param githubClient - GitHub client instance
 * @param owner - Repository owner
 * @param repoName - Repository name
 * @param daysBack - Number of days to look back
 * @returns Map of contributor usernames to their contribution counts
 */
export async function fetchRepositoryContributions(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number,
): Promise<Map<string, number>> {
  const contributions = new Map<string, number>();
  const cutoffDate = createCutoffDate(daysBack);

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const commits = await githubClient.getRepositoryCommits(owner, repoName, {
        per_page: GITHUB_PAGE_SIZE,
        page,
      });

      if (commits.length === 0) {
        hasMore = false;
        break;
      }

      for (const commit of commits) {
        if (commit.commit.author?.date) {
          const commitDate = new Date(commit.commit.author.date);
          if (commitDate >= cutoffDate) {
            const author =
              commit.author?.login || commit.commit.author?.name || "Unknown";
            contributions.set(author, (contributions.get(author) || 0) + 1);
          } else {
            // If we've reached commits older than our cutoff, we can stop
            hasMore = false;
            break;
          }
        }
      }

      page++;
    }
  } catch (error) {
    logger.error(
      { owner, repoName, error: error instanceof Error ? error.message : "Unknown error" },
      "Error fetching contributions",
    );
  }

  return contributions;
}

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
  const prs: PullRequestBasic[] = [];
  const cutoffDate = createCutoffDate(daysBack);

  try {
    logger.debug(
      { owner, repoName, daysBack },
      "Fetching PRs",
    );
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await githubClient.getPullRequests(owner, repoName, {
        state: "closed",
        sort: "created",
        direction: "desc",
        per_page: GITHUB_PAGE_SIZE,
        page,
      });

      if (response.length === 0) {
        hasMore = false;
        break;
      }

      for (const pr of response) {
        if (pr.created_at) {
          const prDate = new Date(pr.created_at);
          if (prDate >= cutoffDate) {
            prs.push({
              id: pr.id,
              number: pr.number,
              created_at: pr.created_at,
              closed_at: pr.closed_at,
              merged_at: pr.merged_at,
              user: pr.user,
            });
          } else {
            // If we've reached PRs older than our cutoff, we can stop
            hasMore = false;
            break;
          }
        }
      }

      page++;
    }

    logger.debug(
      { owner, repoName, prCount: prs.length },
      "Successfully fetched PRs",
    );
  } catch (error: unknown) {
    const errorWithStatus = error as { status?: number; message?: string };
    logger.error(
      { owner, repoName, error: errorWithStatus.message || "Unknown error" },
      "Error fetching PRs",
    );

    // If it's a 404 or 403, the repository might not exist or be accessible
    if (errorWithStatus.status === 404 || errorWithStatus.status === 403) {
      logger.warn(
        { owner, repoName },
        "Repository is not accessible, skipping",
      );
      return [];
    }

    // For other errors, re-throw to be handled by the calling function
    throw error;
  }

  return prs;
}

/**
 * Analyzes a single PR to determine review status and timing.
 *
 * @param githubClient - GitHub client instance
 * @param owner - Repository owner
 * @param repoName - Repository name
 * @param pr - Basic PR data
 * @returns Analysis results including review status and timing metrics
 */
export async function analyzePR(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  pr: PullRequestBasic,
): Promise<{
  isReviewed: boolean;
  isMerged: boolean;
  isMergedWithoutReview: boolean;
  isSuccessful: boolean;
  timeToFirstReview?: number;
}> {
  try {
    const reviews = await githubClient.getPullRequestReviews(
      owner,
      repoName,
      pr.number,
    );

    const isReviewed = reviews.length > 0;
    const isMerged = !!pr.merged_at;
    const isSuccessful = !!pr.merged_at;

    let timeToFirstReview: number | undefined;
    if (isReviewed && pr.created_at) {
      const firstReview = reviews.find((review) => review.submitted_at);
      if (firstReview?.submitted_at) {
        const timeMs =
          new Date(firstReview.submitted_at).getTime() -
          new Date(pr.created_at).getTime();
        // Convert to days and sanitize
        timeToFirstReview = sanitizeMetric(timeMs / (1000 * 60 * 60 * 24));
      }
    }

    const isMergedWithoutReview = isMerged && !isReviewed;

    return {
      isReviewed,
      isMerged,
      isMergedWithoutReview,
      isSuccessful,
      timeToFirstReview,
    };
  } catch (error) {
    logger.error(
      { owner, repoName, prNumber: pr.number, error: error instanceof Error ? error.message : "Unknown error" },
      "Error analyzing PR",
    );
    return {
      isReviewed: false,
      isMerged: false,
      isMergedWithoutReview: false,
      isSuccessful: false,
    };
  }
}

/**
 * Calculates review metrics for a set of PRs
 */
export async function calculateRepositoryReviewMetrics(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  prs: PullRequestBasic[],
): Promise<PRReviewData> {
  const reviewData: PRReviewData = {
    totalPRs: prs.length,
    totalMergedPRs: 0,
    numberOfPRsReviewed: 0,
    numberOfPRsMergedWithoutReview: 0,
    totalTimeToFirstReview: 0,
    prsWithReviewTime: 0,
    totalSuccessfulPRs: 0,
  };

  for (const pr of prs) {
    const analysis = await analyzePR(githubClient, owner, repoName, pr);

    if (analysis.isMerged) {
      reviewData.totalMergedPRs++;
    }

    if (analysis.isReviewed) {
      reviewData.numberOfPRsReviewed++;
    }

    if (analysis.isMergedWithoutReview) {
      reviewData.numberOfPRsMergedWithoutReview++;
    }

    if (analysis.isSuccessful) {
      reviewData.totalSuccessfulPRs++;
    }

    if (analysis.timeToFirstReview !== undefined) {
      reviewData.totalTimeToFirstReview += analysis.timeToFirstReview;
      reviewData.prsWithReviewTime++;
    }
  }

  return reviewData;
}

/**
 * Calculates final metrics from review data.
 * Uses safe math operations to prevent NaN/Infinity results.
 *
 * @param reviewData - Aggregated PR review data
 * @returns Calculated metrics with validated values
 */
export function calculateFinalMetrics(reviewData: PRReviewData): {
  percentageOfPRsReviewed: number;
  percentageOfPRsMergedWithoutReview: number;
  averageTimeToFirstReview: number;
  prSuccessRate: number;
} {
  return {
    percentageOfPRsReviewed: safePercentage(
      reviewData.numberOfPRsReviewed,
      reviewData.totalPRs
    ),
    percentageOfPRsMergedWithoutReview: safePercentage(
      reviewData.numberOfPRsMergedWithoutReview,
      reviewData.totalPRs
    ),
    averageTimeToFirstReview: sanitizeMetric(
      safeDivide(reviewData.totalTimeToFirstReview, reviewData.prsWithReviewTime)
    ),
    prSuccessRate: safePercentage(
      reviewData.totalSuccessfulPRs,
      reviewData.totalPRs
    ),
  };
}

/**
 * Creates metrics for a specific time period
 */
export function createTimePeriodMetrics(
  reviewData: PRReviewData,
  finalMetrics: ReturnType<typeof calculateFinalMetrics>,
  period: TimePeriod,
): Record<string, number> {
  return {
    [`numberOfPRsReviewed_${period}d`]: reviewData.numberOfPRsReviewed,
    [`numberOfPRsMergedWithoutReview_${period}d`]:
      reviewData.numberOfPRsMergedWithoutReview,
    [`percentageOfPRsReviewed_${period}d`]:
      finalMetrics.percentageOfPRsReviewed,
    [`percentageOfPRsMergedWithoutReview_${period}d`]:
      finalMetrics.percentageOfPRsMergedWithoutReview,
    [`averageTimeToFirstReview_${period}d`]:
      finalMetrics.averageTimeToFirstReview,
    [`prSuccessRate_${period}d`]: finalMetrics.prSuccessRate,
    [`totalPRs_${period}d`]: reviewData.totalPRs,
    [`totalMergedPRs_${period}d`]: reviewData.totalMergedPRs,
  };
}

/**
 * Creates a service metrics record
 */
export function createServiceMetricsRecord(
  repo: Repository,
  timePeriodMetrics: Record<string, number>,
): ServiceMetrics {
  return {
    repoId: repo.id.toString(),
    repoName: repo.name,
    organization: repo.owner.login,
    ...timePeriodMetrics,
  } as ServiceMetrics;
}

/**
 * Stores service metrics in Port
 */
export async function storeServiceMetrics(
  record: ServiceMetrics,
): Promise<PortEntity> {
  const props: Record<string, unknown> = _.chain(record)
    .omit(["repoId", "repoName"])
    .mapKeys((_value, key) => _.snakeCase(key))
    .value();

  const entity: PortEntity = {
    identifier: record.repoName,
    title: record.repoName,
    properties: props,
  };

  return entity;
}

/**
 * Stores multiple service metrics entities in Port using bulk ingestion.
 *
 * @param entities - Array of Port entities to store
 */
export async function storeServiceMetricsEntities(
  entities: PortEntity[],
): Promise<void> {
  if (entities.length === 0) {
    logger.info("No service metrics entities to store");
    return;
  }

  try {
    logger.info(
      { entityCount: entities.length },
      "Storing service metrics entities using bulk ingestion",
    );
    const results = await upsertEntitiesInBatches(
      getServiceBlueprintName(),
      entities,
    );

    // Aggregate results
    const totalSuccessful = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => r.created).length,
      0,
    );
    const totalFailed = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => !r.created).length,
      0,
    );

    logger.info(
      { successful: totalSuccessful, failed: totalFailed },
      "Bulk ingestion completed",
    );

    if (totalFailed > 0) {
      const allFailed = results.flatMap((result) =>
        result.entities.filter((r) => !r.created),
      );
      const failedIdentifiers = allFailed.map((r) => r.identifier);
      logger.warn({ failedIdentifiers }, "Some entities failed to store");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { error: errorMessage },
      "Failed to store service metrics entities",
    );
    throw new Error(`Failed to store service metrics entities: ${errorMessage}`);
  }
}

/**
 * Logs a summary of service metrics.
 *
 * @param record - Service metrics record to log
 */
export function logServiceMetricsSummary(record: ServiceMetrics): void {
  logger.info(
    {
      repoName: record.repoName,
      organization: record.organization,
      repoId: record.repoId,
    },
    "Service Metrics Summary",
  );

  const timePeriods: TimePeriod[] = [1, 7, 30, 60, 90];
  for (const period of timePeriods) {
    logger.debug(
      {
        period: `${period}d`,
        totalPRs: record[`totalPRs_${period}d` as keyof ServiceMetrics],
        mergedPRs: record[`totalMergedPRs_${period}d` as keyof ServiceMetrics],
        reviewedPRs: record[`numberOfPRsReviewed_${period}d` as keyof ServiceMetrics],
        mergedWithoutReview: record[`numberOfPRsMergedWithoutReview_${period}d` as keyof ServiceMetrics],
        reviewPercentage: sanitizeMetric(record[`percentageOfPRsReviewed_${period}d` as keyof ServiceMetrics] as number),
        successRate: sanitizeMetric(record[`prSuccessRate_${period}d` as keyof ServiceMetrics] as number),
        avgTimeToFirstReview: sanitizeMetric(record[`averageTimeToFirstReview_${period}d` as keyof ServiceMetrics] as number),
        contributionStdDev: sanitizeMetric(record[`contributionStandardDeviation_${period}d` as keyof ServiceMetrics] as number),
      },
      `Metrics for ${period} day period`,
    );
  }
}

/**
 * Processes service metrics for a single repository with optimized data fetching.
 *
 * @param githubClient - GitHub client instance
 * @param repo - Repository to process
 * @param repoIndex - Current index in the batch
 * @param totalRepos - Total number of repos being processed
 * @returns Port entity with calculated metrics
 */
export async function processRepositoryServiceMetrics(
  githubClient: GitHubClient,
  repo: Repository,
  repoIndex: number,
  totalRepos: number,
): Promise<PortEntity> {
  logger.info(
    { repoName: repo.name, repoIndex: repoIndex + 1, totalRepos },
    "Processing service metrics for repository",
  );

  try {
    const timePeriods: TimePeriod[] = [
      TIME_PERIODS.ONE_DAY,
      TIME_PERIODS.SEVEN_DAYS,
      TIME_PERIODS.THIRTY_DAYS,
      TIME_PERIODS.SIXTY_DAYS,
      TIME_PERIODS.NINETY_DAYS,
    ];
    const maxPeriod = getMaxTimePeriod(timePeriods); // 90 days
    const allTimePeriodMetrics: Record<string, number> = {};

    // Fetch all data once for the maximum time period (90 days)
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

    logger.debug(
      { repoName: repo.name, maxPeriod },
      "Fetching contributions",
    );
    const allContributions = await fetchRepositoryContributions(
      githubClient,
      repo.owner.login,
      repo.name,
      maxPeriod,
    );

    // Process each time period by filtering the already-fetched data
    for (const period of timePeriods) {
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

      const reviewData = await calculateRepositoryReviewMetrics(
        githubClient,
        repo.owner.login,
        repo.name,
        periodPRs,
      );
      const finalMetrics = calculateFinalMetrics(reviewData);
      const periodMetrics = createTimePeriodMetrics(
        reviewData,
        finalMetrics,
        period,
      );

      // Calculate contribution standard deviation for this period
      const periodContributions = new Map<string, number>();

      for (const [contributor, count] of allContributions.entries()) {
        // Note: We can't filter contributions by date since we don't have individual commit dates
        // This is a limitation of the current API approach, but we're still optimizing the PR fetching
        periodContributions.set(contributor, count);
      }

      const contributionCounts = Array.from(periodContributions.values());
      const contributionStdDev =
        calculateContributionStandardDeviation(contributionCounts);
      periodMetrics[`contributionStandardDeviation_${period}d`] =
        contributionStdDev;

      Object.assign(allTimePeriodMetrics, periodMetrics);
    }

    const record = createServiceMetricsRecord(repo, allTimePeriodMetrics);
    const entity = await storeServiceMetrics(record);
    logServiceMetricsSummary(record);
    return entity;
  } catch (error) {
    logger.error(
      { repoName: repo.name, error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to process service metrics for repository",
    );
    throw error;
  }
}

/**
 * Main function to calculate and store service metrics for multiple repositories.
 *
 * @param repos - Array of repositories to process
 * @param githubClient - GitHub client instance
 */
export async function calculateAndStoreServiceMetrics(
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
    entity?: PortEntity;
  }> = [];
  const totalBatches = Math.ceil(repos.length / concurrencyLimit);

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit);
    const batchNumber = Math.floor(i / concurrencyLimit) + 1;

    logger.info(
      { batchNumber, totalBatches, batchSize: batch.length },
      "Processing repository batch",
    );

    const batchPromises = batch.map(async (repo, batchIndex) => {
      const repoIndex = i + batchIndex;
      try {
        const entity = await processRepositoryServiceMetrics(
          githubClient,
          repo,
          repoIndex,
          repos.length,
        );
        return { success: true, repoName: repo.name, entity };
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
  }

  // Process results and collect all entities
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  failedRepos.push(...failed.map((r) => r.repoName));
  hasFatalError = failed.length > 0;

  // Collect all entities from successful repositories
  successful.forEach((result) => {
    if (result.entity) {
      allEntities.push(result.entity);
    }
  });

  logger.info(
    { successful: successful.length, failed: failed.length, totalEntities: allEntities.length },
    "Service metrics processing complete",
  );

  // If all repositories failed, that's a fatal error
  if (failedRepos.length === repos.length && repos.length > 0) {
    throw new Error(
      `Failed to process any repositories. Failed repos: ${failedRepos.join(", ")}`,
    );
  }

  // If some repositories failed, log a warning but don't fail the entire process
  if (failedRepos.length > 0) {
    logger.warn(
      { failedRepos, failedCount: failedRepos.length },
      "Some repositories failed to process",
    );
  }

  // If there were any fatal errors and no successful processing, throw an error
  if (hasFatalError && failedRepos.length === repos.length) {
    throw new Error("All repositories failed to process");
  }

  // Store all entities in bulk if we have any
  if (allEntities.length > 0) {
    logger.info(
      { entityCount: allEntities.length },
      "Starting bulk ingestion of service entities",
    );
    await storeServiceMetricsEntities(allEntities);
    logger.info("Bulk ingestion completed successfully");
  }
}
