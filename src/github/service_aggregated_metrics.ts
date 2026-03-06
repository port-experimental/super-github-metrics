import type { GitHubClient } from '../clients/github';
import type {
  PullRequestBasic,
  Repository,
  ServiceMetricsEntity,
  TimeSeriesMetrics,
} from '../clients/github/types';
import { upsertEntities, upsertEntitiesInBatches } from '../clients/port';
import { getPortBlueprintEnv, getRepositoryRelationKey, getRepositoryRelationTarget } from '../env';
import {
  calculateContributionStandardDeviation,
  calculateFinalMetrics,
  calculateReviewMetricsFromCache,
  fetchRepositoryContributions,
  fetchRepositoryPRs,
  type PRReviewData,
} from './service_metrics';
import { CONCURRENCY_LIMITS } from './utils';

export function getServiceMetricsBlueprintName(): string {
  return getPortBlueprintEnv().serviceMetricsBlueprint;
}

/**
 * Generates the service metrics blueprint with configurable relation target.
 * The relation key and target can be customized via environment variables:
 * - PORT_REPOSITORY_RELATION_KEY: The key name for the relation (default: 'service')
 * - PORT_REPOSITORY_RELATION_TARGET: The target blueprint (default: 'service')
 */
export function getServiceMetricsBlueprint() {
  const relationKey = getRepositoryRelationKey();
  const relationTarget = getRepositoryRelationTarget();

  return {
    identifier: 'serviceMetrics',
    description: 'Time-series metrics for services to enable dashboard visualizations',
    title: 'Service Metrics',
    icon: 'Chart',
    schema: {
      properties: {
        // Time period identifier (e.g., "20240115" for daily, "202403" for weekly, "202401" for monthly)
        period: {
          type: 'string',
          title: 'Time Period',
          description:
            'The time period this metric represents (YYYYMMDD for daily, YYYYWW for weekly, YYYYMM for monthly)',
          format: 'date-time',
        },
        period_type: {
          type: 'string',
          title: 'Period Type',
          description: 'The type of time period (daily, weekly, monthly)',
          enum: ['daily', 'weekly', 'monthly'],
        },
        // Core metrics
        total_prs: {
          type: 'number',
          title: 'Total Pull Requests',
          description: 'Total number of pull requests in this period',
        },
        total_merged_prs: {
          type: 'number',
          title: 'Total Merged PRs',
          description: 'Total number of merged pull requests in this period',
        },
        number_of_prs_reviewed: {
          type: 'number',
          title: 'PRs Reviewed',
          description: 'Number of pull requests that received at least one review',
        },
        number_of_prs_merged_without_review: {
          type: 'number',
          title: 'PRs Merged Without Review',
          description: 'Number of pull requests merged without any reviews',
        },
        percentage_of_prs_reviewed: {
          type: 'number',
          title: 'PR Review Percentage',
          description: 'Percentage of pull requests that received at least one review',
        },
        percentage_of_prs_merged_without_review: {
          type: 'number',
          title: 'PR Merged Without Review Percentage',
          description: 'Percentage of pull requests merged without any reviews',
        },
        average_time_to_first_review: {
          type: 'number',
          title: 'Average Time to First Review (Days)',
          description: 'Average time in days from PR creation to first review',
        },
        pr_success_rate: {
          type: 'number',
          title: 'PR Success Rate (%)',
          description: 'Percentage of pull requests that were successfully merged',
        },
        contribution_standard_deviation: {
          type: 'number',
          title: 'Contribution Standard Deviation',
          description: 'Standard deviation of contribution counts across contributors',
        },
        // Metadata
        calculated_at: {
          type: 'string',
          title: 'Calculated At',
          description: 'Timestamp when these metrics were calculated',
          format: 'date-time',
        },
        data_source: {
          type: 'string',
          title: 'Data Source',
          description: 'Source of the metrics data',
          default: 'github',
        },
      },
      required: ['period', 'period_type', 'total_prs', 'total_merged_prs'],
    },
    relations: {
      [relationKey]: {
        title: relationKey === 'service' ? 'Service' : 'Repository',
        target: relationTarget,
        required: true,
        many: false,
      },
    },
  };
}

// Keep the constant for backwards compatibility, but note it uses default values
export const SERVICE_METRICS_BLUEPRINT = getServiceMetricsBlueprint();

/**
 * Groups PRs by time period for time-series analysis
 */
export function groupPRsByPeriod(
  prs: PullRequestBasic[],
  periodType: 'daily' | 'weekly' | 'monthly'
): Map<string, PullRequestBasic[]> {
  const grouped = new Map<string, PullRequestBasic[]>();

  for (const pr of prs) {
    if (!pr.created_at) continue;

    const date = new Date(pr.created_at);
    let periodKey: string;

    switch (periodType) {
      case 'daily': {
        // Format: YYYY-MM-DDT00:00:00.000Z (ISO8601 datetime format at 12:00 AM)
        const dailyDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        periodKey = dailyDate.toISOString();
        break;
      }
      case 'weekly': {
        // Format: YYYY-MM-DDT00:00:00.000Z (start of the week in ISO8601 datetime format at 12:00 AM)
        const dayOfWeek = date.getDay();
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - daysToSubtract);
        startOfWeek.setHours(0, 0, 0, 0);
        periodKey = startOfWeek.toISOString();
        break;
      }
      case 'monthly': {
        // Format: YYYY-MM-DDT00:00:00.000Z (first day of month in ISO8601 datetime format at 12:00 AM)
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        periodKey = startOfMonth.toISOString();
        break;
      }
      default:
        continue;
    }

    if (!grouped.has(periodKey)) {
      grouped.set(periodKey, []);
    }
    grouped.get(periodKey)?.push(pr);
  }

  return grouped;
}

/**
 * Creates time-series metrics for a specific period
 */
export function createTimeSeriesMetrics(
  period: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  reviewData: PRReviewData,
  finalMetrics: ReturnType<typeof calculateFinalMetrics>,
  contributionStdDev: number
): TimeSeriesMetrics {
  return {
    period,
    periodType,
    totalPRs: reviewData.totalPRs,
    totalMergedPRs: reviewData.totalMergedPRs,
    numberOfPRsReviewed: reviewData.numberOfPRsReviewed,
    numberOfPRsMergedWithoutReview: reviewData.numberOfPRsMergedWithoutReview,
    percentageOfPRsReviewed: finalMetrics.percentageOfPRsReviewed,
    percentageOfPRsMergedWithoutReview: finalMetrics.percentageOfPRsMergedWithoutReview,
    averageTimeToFirstReview: finalMetrics.averageTimeToFirstReview,
    prSuccessRate: finalMetrics.prSuccessRate,
    contributionStandardDeviation: contributionStdDev,
  };
}

/**
 * Creates a service metrics entity for Port
 */
export function createServiceMetricsEntity(
  repo: Repository,
  metrics: TimeSeriesMetrics
): ServiceMetricsEntity {
  // Create a compact identifier that fits within 30 characters
  // Format: {serviceName}{periodType}{period} (e.g., "my-service-d20240115")
  const serviceName = repo.name; // Use service name as-is
  const periodType = metrics.periodType.charAt(0); // 'd' for daily, 'w' for weekly, 'm' for monthly
  const period = metrics.period.replace(/[-:T.Z]/g, '').slice(0, 8); // Extract YYYYMMDD from ISO8601 datetime

  // Ensure the identifier doesn't exceed 30 characters
  const maxServiceNameLength = 30 - periodType.length - period.length;
  const truncatedServiceName =
    serviceName.length > maxServiceNameLength
      ? serviceName.slice(0, maxServiceNameLength)
      : serviceName;

  const identifier = `${truncatedServiceName}${periodType}${period}`;
  const title = `${repo.name} - ${metrics.period}`;

  return {
    identifier,
    title,
    properties: {
      period: metrics.period,
      period_type: metrics.periodType,
      total_prs: metrics.totalPRs,
      total_merged_prs: metrics.totalMergedPRs,
      number_of_prs_reviewed: metrics.numberOfPRsReviewed,
      number_of_prs_merged_without_review: metrics.numberOfPRsMergedWithoutReview,
      percentage_of_prs_reviewed: metrics.percentageOfPRsReviewed,
      percentage_of_prs_merged_without_review: metrics.percentageOfPRsMergedWithoutReview,
      average_time_to_first_review: metrics.averageTimeToFirstReview,
      pr_success_rate: metrics.prSuccessRate,
      contribution_standard_deviation: metrics.contributionStandardDeviation,
      calculated_at: new Date().toISOString(),
      data_source: 'github',
    },
    relations: {
      [getRepositoryRelationKey()]: repo.name, // Use configurable relation key
    },
  };
}

/**
 * Stores service metrics entity in Port
 */
export async function storeServiceMetricsEntity(entity: ServiceMetricsEntity): Promise<void> {
  try {
    await upsertEntities(getServiceMetricsBlueprintName(), [entity]);
    console.log(`Successfully stored service metrics entity: ${entity.title}`);
  } catch (error) {
    console.error(
      `Failed to store service metrics entity ${entity.title}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  }
}

/**
 * Processes time-series service metrics for a repository
 * Returns the entities instead of storing them individually
 */
export async function processRepositoryTimeSeriesMetrics(
  githubClient: GitHubClient,
  repo: Repository,
  repoIndex: number,
  totalRepos: number,
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily',
  daysBack: number = 90
): Promise<ServiceMetricsEntity[]> {
  console.log(
    `Processing time-series service metrics for repo ${repo.name} (${repoIndex + 1}/${totalRepos})`
  );

  const entities: ServiceMetricsEntity[] = [];

  try {
    // Fetch PRs and contributions in parallel (they're independent)
    console.log(`  Fetching PRs and contributions for ${daysBack} day period in parallel...`);
    const [allPRs, allContributions] = await Promise.all([
      fetchRepositoryPRs(githubClient, repo.owner.login, repo.name, daysBack),
      fetchRepositoryContributions(githubClient, repo.owner.login, repo.name, daysBack),
    ]);
    console.log(`  Found ${allPRs.length} PRs in the last ${daysBack} days for ${repo.name}`);

    // Fetch ALL review data once for all PRs (optimization to avoid redundant API calls per period)
    console.log(`  Fetching reviews for all ${allPRs.length} PRs using batched GraphQL...`);
    const reviewFetchStart = Date.now();
    const allReviews = await githubClient.getPullRequestReviewsBatch(
      repo.owner.login,
      repo.name,
      allPRs.map((pr) => pr.number)
    );
    const reviewFetchDuration = Date.now() - reviewFetchStart;
    console.log(`  Review fetch completed in ${reviewFetchDuration}ms for ${allReviews.size} PRs`);

    // Group PRs by time period
    console.log(`  Grouping PRs by ${periodType} periods...`);
    const groupedPRs = groupPRsByPeriod(allPRs, periodType);
    console.log(`  Created ${groupedPRs.size} ${periodType} periods`);

    // Process each time period using cached review data (NO API CALLS in this loop)
    let processedPeriods = 0;
    for (const [period, periodPRs] of groupedPRs.entries()) {
      if (periodPRs.length === 0) continue;

      console.log(`  Processing period ${period} with ${periodPRs.length} PRs...`);

      // Calculate review metrics using cached data - NO API CALLS
      const reviewData = calculateReviewMetricsFromCache(periodPRs, allReviews);
      const finalMetrics = calculateFinalMetrics(reviewData);

      // Calculate contribution standard deviation for this period
      // Note: This is a simplified approach since we don't have per-period contribution data
      const contributionCounts = Array.from(allContributions.values());
      const contributionStdDev = calculateContributionStandardDeviation(contributionCounts);

      // Create time-series metrics
      const timeSeriesMetrics = createTimeSeriesMetrics(
        period,
        periodType,
        reviewData,
        finalMetrics,
        contributionStdDev
      );

      // Create the entity and add to collection
      const entity = createServiceMetricsEntity(repo, timeSeriesMetrics);
      entities.push(entity);

      processedPeriods++;
    }

    console.log(
      `  Successfully processed ${processedPeriods} ${periodType} periods for ${repo.name}`
    );
    return entities;
  } catch (error) {
    console.error(
      `Failed to process time-series service metrics for repo ${repo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  }
}

/**
 * Stores multiple service metrics entities in Port using bulk ingestion
 */
export async function storeServiceMetricsEntities(entities: ServiceMetricsEntity[]): Promise<void> {
  if (entities.length === 0) {
    console.log('No entities to store');
    return;
  }

  try {
    console.log(`Storing ${entities.length} service metrics entities using bulk ingestion...`);
    const results = await upsertEntitiesInBatches(getServiceMetricsBlueprintName(), entities);

    // Aggregate results
    // Note: When using upsert=true&merge=true, created:false means successfully updated (not a failure)
    // Only the errors array contains actual failures
    const totalCreated = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => r.created).length,
      0
    );
    const totalUpdated = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => !r.created).length,
      0
    );
    const totalFailed = results.reduce((sum, result) => sum + (result.errors?.length ?? 0), 0);
    const totalSuccessful = totalCreated + totalUpdated;

    console.log(
      `Bulk ingestion completed: ${totalSuccessful} successful (${totalCreated} created, ${totalUpdated} updated), ${totalFailed} failed`
    );

    if (totalFailed > 0) {
      const allErrors = results.flatMap((result) => result.errors ?? []);
      const failedIdentifiers = allErrors.map((e) => e.identifier);
      console.warn(`Failed entities: ${failedIdentifiers.join(', ')}`);
    }
  } catch (error) {
    console.error(
      `Failed to store service metrics entities: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  }
}

/**
 * Main function to calculate and store time-series service metrics for multiple repositories
 */
export async function calculateAndStoreTimeSeriesServiceMetrics(
  repos: Repository[],
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily',
  daysBack: number = 90,
  githubClient: GitHubClient
): Promise<void> {
  let hasFatalError = false;
  const failedRepos: string[] = [];
  const allEntities: ServiceMetricsEntity[] = [];

  // Process repositories concurrently with a reasonable concurrency limit
  const concurrencyLimit = CONCURRENCY_LIMITS.TIME_SERIES_REPOSITORIES; // Lower limit for time-series due to more intensive processing
  const results: Array<{
    success: boolean;
    repoName: string;
    error?: any;
    entities?: ServiceMetricsEntity[];
  }> = [];

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit);
    console.log(
      `Processing time-series batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(repos.length / concurrencyLimit)} (${batch.length} repos)`
    );

    const batchPromises = batch.map(async (repo, batchIndex) => {
      const repoIndex = i + batchIndex;
      try {
        const entities = await processRepositoryTimeSeriesMetrics(
          githubClient,
          repo,
          repoIndex,
          repos.length,
          periodType,
          daysBack
        );
        return { success: true, repoName: repo.name, entities };
      } catch (error) {
        console.error(
          `Error processing repo ${repo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    if (result.entities) {
      allEntities.push(...result.entities);
    }
  });

  console.log(
    `Time-series metrics processing complete: ${successful.length} successful, ${failed.length} failed`
  );
  console.log(`Total entities to ingest: ${allEntities.length}`);

  // If all repositories failed, that's a fatal error
  if (failedRepos.length === repos.length && repos.length > 0) {
    throw new Error(`Failed to process any repositories. Failed repos: ${failedRepos.join(', ')}`);
  }

  // If some repositories failed, log a warning but don't fail the entire process
  if (failedRepos.length > 0) {
    console.warn(
      `Warning: Failed to process ${failedRepos.length} repositories: ${failedRepos.join(', ')}`
    );
  }

  // If there were any fatal errors and no successful processing, throw an error
  if (hasFatalError && failedRepos.length === repos.length) {
    throw new Error('All repositories failed to process');
  }

  // Store all entities in bulk if we have any
  if (allEntities.length > 0) {
    console.log(`Starting bulk ingestion of ${allEntities.length} entities...`);
    await storeServiceMetricsEntities(allEntities);
    console.log('Bulk ingestion completed successfully');
  }
}
