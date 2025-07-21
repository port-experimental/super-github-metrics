import _ from 'lodash';
import { createGitHubClient, type GitHubClient } from '../clients/github';
import { createEntity } from '../clients/port';
import type { PullRequestBasic, Repository } from '../types/github';
import { SERVICE_METRICS_BLUEPRINT, type ServiceMetricsEntity } from './service_metrics_blueprint';
import { 
  PRReviewData, 
  calculateRepositoryReviewMetrics, 
  calculateFinalMetrics, 
  fetchRepositoryContributions, 
  calculateContributionStandardDeviation,
  fetchRepositoryPRs
} from './service_metrics';

export interface TimeSeriesMetrics {
  period: string;
  periodType: 'daily' | 'weekly' | 'monthly';
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
      case 'daily':
        periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
        break;
      case 'weekly':
        const year = date.getFullYear();
        const week = Math.ceil((date.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        periodKey = `${year}-W${week.toString().padStart(2, '0')}`;
        break;
      case 'monthly':
        periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
      default:
        continue;
    }

    if (!grouped.has(periodKey)) {
      grouped.set(periodKey, []);
    }
    grouped.get(periodKey)!.push(pr);
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
  const identifier = `${repo.id}-${metrics.period}-${metrics.periodType}`;
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
      service: repo.id.toString(),
    },
  };
}

/**
 * Stores service metrics entity in Port
 */
export async function storeServiceMetricsEntity(entity: ServiceMetricsEntity): Promise<void> {
  try {
    await createEntity(SERVICE_METRICS_BLUEPRINT.identifier, entity);
    console.log(`Successfully stored service metrics entity: ${entity.title}`);
  } catch (error) {
    console.error(`Failed to store service metrics entity ${entity.title}:`, error);
    throw error;
  }
}

/**
 * Processes time-series service metrics for a repository
 */
export async function processRepositoryTimeSeriesMetrics(
  githubClient: GitHubClient,
  repo: Repository,
  repoIndex: number,
  totalRepos: number,
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily',
  daysBack: number = 90
): Promise<void> {
  console.log(`Processing time-series service metrics for repo ${repo.name} (${repoIndex + 1}/${totalRepos})`);

  try {
    // Fetch all PRs for the specified time period
    console.log(`  Fetching PRs for ${daysBack} day period...`);
    const allPRs = await fetchRepositoryPRs(githubClient, repo.owner.login, repo.name, daysBack);
    console.log(`  Found ${allPRs.length} PRs in the last ${daysBack} days for ${repo.name}`);

    // Fetch contributions for the same period
    console.log(`  Fetching contributions for ${daysBack} day period...`);
    const allContributions = await fetchRepositoryContributions(
      githubClient,
      repo.owner.login,
      repo.name,
      daysBack
    );

    // Group PRs by time period
    console.log(`  Grouping PRs by ${periodType} periods...`);
    const groupedPRs = groupPRsByPeriod(allPRs, periodType);
    console.log(`  Created ${groupedPRs.size} ${periodType} periods`);

    // Process each time period
    let processedPeriods = 0;
    for (const [period, periodPRs] of groupedPRs.entries()) {
      if (periodPRs.length === 0) continue;

      console.log(`  Processing period ${period} with ${periodPRs.length} PRs...`);

      // Calculate review metrics for this period
      const reviewData = await calculateRepositoryReviewMetrics(
        githubClient,
        repo.owner.login,
        repo.name,
        periodPRs
      );
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

      // Create and store the entity
      const entity = createServiceMetricsEntity(repo, timeSeriesMetrics);
      await storeServiceMetricsEntity(entity);

      processedPeriods++;
    }

    console.log(`  Successfully processed ${processedPeriods} ${periodType} periods for ${repo.name}`);
  } catch (error) {
    console.error(`Failed to process time-series service metrics for repo ${repo.name}:`, error);
    throw error;
  }
}

/**
 * Main function to calculate and store time-series service metrics for multiple repositories
 */
export async function calculateAndStoreTimeSeriesServiceMetrics(
  repos: Repository[],
  authToken: string,
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily',
  daysBack: number = 90
): Promise<void> {
  const githubClient = createGitHubClient(authToken);
  let hasFatalError = false;
  const failedRepos: string[] = [];

  for (const [index, repo] of repos.entries()) {
    try {
      await processRepositoryTimeSeriesMetrics(githubClient, repo, index, repos.length, periodType, daysBack);
    } catch (error) {
      console.error(`Error processing repo ${repo.name}:`, error);
      failedRepos.push(repo.name);
      hasFatalError = true;
    }
  }

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
} 