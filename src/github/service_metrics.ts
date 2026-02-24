import _ from "lodash";
import { createGitHubClient, type GitHubClient } from "../clients/github";
import { upsertEntitiesInBatches } from "../clients/port";
import type {
  PullRequestBasic,
  Repository,
  GitHubAppConfig,
  Commit,
} from "../clients/github/types";
import {
  filterDataForTimePeriod,
  filterCommitsForTimePeriod,
  TIME_PERIODS,
  type TimePeriod,
  getMaxTimePeriod,
  CONCURRENCY_LIMITS,
} from "./utils";
import type { PortEntity } from "../clients/port/types";
import { getPortBlueprintEnv } from "../env";

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

/**
 * Calculates the standard deviation of contribution counts
 */
export function calculateContributionStandardDeviation(
  contributionCounts: number[],
): number {
  if (contributionCounts.length === 0) return 0;
  if (contributionCounts.length === 1) return 0;

  const mean =
    contributionCounts.reduce((sum, count) => sum + count, 0) /
    contributionCounts.length;
  const squaredDifferences = contributionCounts.map(
    (count) => (count - mean) ** 2,
  );
  const variance =
    squaredDifferences.reduce((sum, diff) => sum + diff, 0) /
    contributionCounts.length;

  return Math.sqrt(variance);
}

/**
 * Fetches all contributions for a repository within the specified time period
 */
export async function fetchRepositoryContributions(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number,
): Promise<Map<string, number>> {
  const contributions = new Map<string, number>();
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const commits = await githubClient.getRepositoryCommits(owner, repoName, {
        per_page: 100,
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
    console.error(
      `Error fetching contributions for ${owner}/${repoName}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return contributions;
}

/**
 * Fetches all commits for a repository within the specified time period.
 * Returns raw commits so callers can filter by period in memory (avoids extra API calls).
 */
export async function fetchRepositoryCommitsForPeriod(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number,
): Promise<Commit[]> {
  const allCommits: Commit[] = [];
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const commits = await githubClient.getRepositoryCommits(owner, repoName, {
        per_page: 100,
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
            allCommits.push(commit);
          } else {
            hasMore = false;
            break;
          }
        }
      }

      page++;
    }
  } catch (error) {
    console.error(
      `Error fetching commits for ${owner}/${repoName}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return allCommits;
}

/**
 * Aggregates commits into a map of author -> contribution count.
 * Same aggregation logic as fetchRepositoryContributions, for use on filtered commit lists.
 */
export function contributionMapFromCommits(
  commits: Commit[],
): Map<string, number> {
  const contributions = new Map<string, number>();
  for (const commit of commits) {
    const author =
      commit.author?.login || commit.commit.author?.name || "Unknown";
    contributions.set(author, (contributions.get(author) || 0) + 1);
  }
  return contributions;
}

/**
 * Fetches all PRs for a repository within the specified time period
 */
export async function fetchRepositoryPRs(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number,
): Promise<PullRequestBasic[]> {
  const prs: PullRequestBasic[] = [];
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  try {
    console.log(
      `Fetching PRs for ${owner}/${repoName} (last ${daysBack} days)`,
    );
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await githubClient.getPullRequests(owner, repoName, {
        state: "closed",
        sort: "created",
        direction: "desc",
        per_page: 100,
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

    console.log(
      `Successfully fetched ${prs.length} PRs from ${owner}/${repoName}`,
    );
  } catch (error: any) {
    console.error(
      `Error fetching PRs for ${owner}/${repoName}: ${error.message || "Unknown error"}`,
    );

    // If it's a 404 or 403, the repository might not exist or be accessible
    if (error.status === 404 || error.status === 403) {
      console.error(
        `Repository ${owner}/${repoName} is not accessible. Skipping...`,
      );
      return [];
    }

    // For other errors, re-throw to be handled by the calling function
    throw error;
  }

  return prs;
}

/**
 * Analyzes a single PR to determine review status and timing
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
        timeToFirstReview =
          (new Date(firstReview.submitted_at).getTime() -
            new Date(pr.created_at).getTime()) /
          (1000 * 60 * 60 * 24); // Convert to days
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
    console.error(
      `Error analyzing PR ${pr.number} in ${owner}/${repoName}: ${error instanceof Error ? error.message : "Unknown error"}`,
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
 * Calculates final metrics from review data
 */
export function calculateFinalMetrics(reviewData: PRReviewData): {
  percentageOfPRsReviewed: number;
  percentageOfPRsMergedWithoutReview: number;
  averageTimeToFirstReview: number;
  prSuccessRate: number;
} {
  return {
    percentageOfPRsReviewed:
      reviewData.totalPRs > 0
        ? (reviewData.numberOfPRsReviewed / reviewData.totalPRs) * 100
        : 0,
    percentageOfPRsMergedWithoutReview:
      reviewData.totalPRs > 0
        ? (reviewData.numberOfPRsMergedWithoutReview / reviewData.totalPRs) *
          100
        : 0,
    averageTimeToFirstReview:
      reviewData.prsWithReviewTime > 0
        ? reviewData.totalTimeToFirstReview / reviewData.prsWithReviewTime
        : 0,
    prSuccessRate:
      reviewData.totalPRs > 0
        ? (reviewData.totalSuccessfulPRs / reviewData.totalPRs) * 100
        : 0,
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
 * Stores multiple service metrics entities in Port using bulk ingestion
 */
export async function storeServiceMetricsEntities(
  entities: PortEntity[],
): Promise<void> {
  if (entities.length === 0) {
    console.log("No service metrics entities to store");
    return;
  }

  try {
    console.log(
      `Storing ${entities.length} service metrics entities using bulk ingestion...`,
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

    console.log(
      `Bulk ingestion completed: ${totalSuccessful} successful, ${totalFailed} failed`,
    );

    if (totalFailed > 0) {
      const allFailed = results.flatMap((result) =>
        result.entities.filter((r) => !r.created),
      );
      const failedIdentifiers = allFailed.map((r) => r.identifier);
      console.warn(`Failed entities: ${failedIdentifiers.join(", ")}`);
    }
  } catch (error) {
    console.error(
      `Failed to store service metrics entities: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

/**
 * Logs a summary of service metrics
 */
export function logServiceMetricsSummary(record: ServiceMetrics): void {
  console.log(`\n=== Service Metrics Summary for ${record.repoName} ===`);
  console.log(`Organization: ${record.organization}`);
  console.log(`Repository ID: ${record.repoId}`);

  const timePeriods: TimePeriod[] = [1, 7, 30, 60, 90];
  for (const period of timePeriods) {
    console.log(`\n--- ${period} Day Period ---`);
    console.log(
      `Total PRs: ${record[`totalPRs_${period}d` as keyof ServiceMetrics]}`,
    );
    console.log(
      `Merged PRs: ${record[`totalMergedPRs_${period}d` as keyof ServiceMetrics]}`,
    );
    console.log(
      `Reviewed PRs: ${record[`numberOfPRsReviewed_${period}d` as keyof ServiceMetrics]}`,
    );
    console.log(
      `Merged without review: ${record[`numberOfPRsMergedWithoutReview_${period}d` as keyof ServiceMetrics]}`,
    );
    console.log(
      `Review percentage: ${(record[`percentageOfPRsReviewed_${period}d` as keyof ServiceMetrics] as number).toFixed(2)}%`,
    );
    console.log(
      `Success rate: ${(record[`prSuccessRate_${period}d` as keyof ServiceMetrics] as number).toFixed(2)}%`,
    );
    console.log(
      `Avg time to first review: ${(record[`averageTimeToFirstReview_${period}d` as keyof ServiceMetrics] as number).toFixed(2)} days`,
    );
    console.log(
      `Contribution std dev: ${(record[`contributionStandardDeviation_${period}d` as keyof ServiceMetrics] as number).toFixed(2)}`,
    );
  }
}

/**
 * Processes service metrics for a single repository with optimized data fetching
 */
export async function processRepositoryServiceMetrics(
  githubClient: GitHubClient,
  repo: Repository,
  repoIndex: number,
  totalRepos: number,
): Promise<PortEntity> {
  console.log(
    `Processing service metrics for repo ${repo.name} (${repoIndex + 1}/${totalRepos})`,
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

    // Fetch all PRs once for the maximum time period (90 days), then filter per period
    console.log(
      `  Fetching PRs for ${maxPeriod} day period (will filter for shorter periods)...`,
    );
    const allPRs = await fetchRepositoryPRs(
      githubClient,
      repo.owner.login,
      repo.name,
      maxPeriod,
    );
    console.log(
      `  Found ${allPRs.length} PRs in the last ${maxPeriod} days for ${repo.name}`,
    );

    // Fetch all commits once for the max period, then filter per period in memory
    console.log(
      `  Fetching commits for ${maxPeriod} day period (will filter for shorter periods)...`,
    );
    const allCommits = await fetchRepositoryCommitsForPeriod(
      githubClient,
      repo.owner.login,
      repo.name,
      maxPeriod,
    );
    console.log(
      `  Found ${allCommits.length} commits in the last ${maxPeriod} days for ${repo.name}`,
    );

    // Process each time period
    for (const period of timePeriods) {
      console.log(`  Processing ${period} day period...`);

      // Filter PRs for this time period
      const periodPRs = filterDataForTimePeriod(allPRs, period);
      console.log(
        `  Filtered to ${periodPRs.length} PRs for ${period} day period`,
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

      // Filter commits for this period and aggregate to contribution counts (no extra API calls)
      const periodCommits = filterCommitsForTimePeriod(allCommits, period);
      const periodContributions = contributionMapFromCommits(periodCommits);
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
    console.error(
      `Failed to process service metrics for repo ${repo.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

/**
 * Main function to calculate and store service metrics for multiple repositories
 */
export async function calculateAndStoreServiceMetrics(
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
    entity?: PortEntity;
  }> = [];

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit);
    console.log(
      `Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(repos.length / concurrencyLimit)} (${batch.length} repos)`,
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
        console.error(
          `Error processing repo ${repo.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
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

  console.log(
    `Service metrics processing complete: ${successful.length} successful, ${failed.length} failed`,
  );
  console.log(`Total entities to ingest: ${allEntities.length}`);

  // If all repositories failed, that's a fatal error
  if (failedRepos.length === repos.length && repos.length > 0) {
    throw new Error(
      `Failed to process any repositories. Failed repos: ${failedRepos.join(", ")}`,
    );
  }

  // If some repositories failed, log a warning but don't fail the entire process
  if (failedRepos.length > 0) {
    console.warn(
      `Warning: Failed to process ${failedRepos.length} repositories: ${failedRepos.join(", ")}`,
    );
  }

  // If there were any fatal errors and no successful processing, throw an error
  if (hasFatalError && failedRepos.length === repos.length) {
    throw new Error("All repositories failed to process");
  }

  // Store all entities in bulk if we have any
  if (allEntities.length > 0) {
    console.log(
      `Starting bulk ingestion of ${allEntities.length} service entities...`,
    );
    await storeServiceMetricsEntities(allEntities);
    console.log("Bulk ingestion completed successfully");
  }
}
