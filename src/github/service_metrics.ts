import _ from 'lodash';
import { createGitHubClient, type GitHubClient, type PullRequestBasic } from '../clients/github';
import { updateEntity } from '../clients/port';

interface ServiceMetrics {
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
  // 7 days metrics
  numberOfPRsReviewed_7d: number;
  numberOfPRsMergedWithoutReview_7d: number;
  percentageOfPRsReviewed_7d: number;
  percentageOfPRsMergedWithoutReview_7d: number;
  averageTimeToFirstReview_7d: number;
  prSuccessRate_7d: number;
  totalPRs_7d: number;
  totalMergedPRs_7d: number;
  // 30 days metrics
  numberOfPRsReviewed_30d: number;
  numberOfPRsMergedWithoutReview_30d: number;
  percentageOfPRsReviewed_30d: number;
  percentageOfPRsMergedWithoutReview_30d: number;
  averageTimeToFirstReview_30d: number;
  prSuccessRate_30d: number;
  totalPRs_30d: number;
  totalMergedPRs_30d: number;
  // 60 days metrics
  numberOfPRsReviewed_60d: number;
  numberOfPRsMergedWithoutReview_60d: number;
  percentageOfPRsReviewed_60d: number;
  percentageOfPRsMergedWithoutReview_60d: number;
  averageTimeToFirstReview_60d: number;
  prSuccessRate_60d: number;
  totalPRs_60d: number;
  totalMergedPRs_60d: number;
  // 90 days metrics
  numberOfPRsReviewed_90d: number;
  numberOfPRsMergedWithoutReview_90d: number;
  percentageOfPRsReviewed_90d: number;
  percentageOfPRsMergedWithoutReview_90d: number;
  averageTimeToFirstReview_90d: number;
  prSuccessRate_90d: number;
  totalPRs_90d: number;
  totalMergedPRs_90d: number;
}

interface PRReviewData {
  totalPRs: number;
  totalMergedPRs: number;
  numberOfPRsReviewed: number;
  numberOfPRsMergedWithoutReview: number;
  totalTimeToFirstReview: number;
  prsWithReviewTime: number;
  totalSuccessfulPRs: number; // PRs that were merged
}

interface Repository {
  id: string;
  name: string;
  owner: {
    login: string;
  };
}

type TimePeriod = 1 | 7 | 30 | 60 | 90;

/**
 * Fetches all PRs for a repository within the specified time period
 */
async function fetchRepositoryPRs(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number
): Promise<PullRequestBasic[]> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const allPRs: PullRequestBasic[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const prs = await githubClient.getPullRequests(owner, repoName, {
      state: 'closed',
      sort: 'created',
      direction: 'desc',
      per_page: 100,
      page: page,
    });

    // Filter PRs created within the specified time period
    const recentPRs = prs.filter((pr: PullRequestBasic) => new Date(pr.created_at) > cutoffDate);
    allPRs.push(...recentPRs);

    // If we got less than 100 PRs or the oldest PR is older than our cutoff, we're done
    hasMore = prs.length === 100 && recentPRs.length === prs.length;
    page++;
  }

  return allPRs;
}

/**
 * Analyzes a single PR to extract review metrics
 */
async function analyzePR(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  pr: PullRequestBasic
): Promise<{
  isReviewed: boolean;
  isMerged: boolean;
  isMergedWithoutReview: boolean;
  isSuccessful: boolean;
  timeToFirstReview?: number;
}> {
  const isMerged = !!pr.merged_at;
  const isSuccessful = isMerged; // A PR is successful if it was merged

  // Get reviews for this PR
  const reviews = await githubClient.getPullRequestReviews(owner, repoName, pr.number);

  const isReviewed = reviews.length > 0;
  const isMergedWithoutReview = isMerged && !isReviewed;

  let timeToFirstReview: number | undefined;
  if (isReviewed && reviews[0].submitted_at && pr.created_at) {
    timeToFirstReview =
      (new Date(reviews[0].submitted_at).getTime() - new Date(pr.created_at).getTime()) /
      (1000 * 60 * 60);
  }

  return {
    isReviewed,
    isMerged,
    isMergedWithoutReview,
    isSuccessful,
    timeToFirstReview,
  };
}

/**
 * Calculates review metrics for all PRs in a repository for a specific time period
 */
async function calculateRepositoryReviewMetrics(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  prs: PullRequestBasic[]
): Promise<PRReviewData> {
  const metrics: PRReviewData = {
    totalPRs: 0,
    totalMergedPRs: 0,
    numberOfPRsReviewed: 0,
    numberOfPRsMergedWithoutReview: 0,
    totalTimeToFirstReview: 0,
    prsWithReviewTime: 0,
    totalSuccessfulPRs: 0,
  };

  for (const pr of prs) {
    metrics.totalPRs++;

    const prAnalysis = await analyzePR(githubClient, owner, repoName, pr);

    if (prAnalysis.isMerged) {
      metrics.totalMergedPRs++;
    }

    if (prAnalysis.isSuccessful) {
      metrics.totalSuccessfulPRs++;
    }

    if (prAnalysis.isReviewed) {
      metrics.numberOfPRsReviewed++;

      if (prAnalysis.timeToFirstReview !== undefined) {
        metrics.totalTimeToFirstReview += prAnalysis.timeToFirstReview;
        metrics.prsWithReviewTime++;
      }
    } else if (prAnalysis.isMergedWithoutReview) {
      metrics.numberOfPRsMergedWithoutReview++;
    }
  }

  return metrics;
}

/**
 * Calculates final percentages and averages from raw metrics
 */
function calculateFinalMetrics(reviewData: PRReviewData): {
  percentageOfPRsReviewed: number;
  percentageOfPRsMergedWithoutReview: number;
  averageTimeToFirstReview: number;
  prSuccessRate: number;
} {
  const percentageOfPRsReviewed =
    reviewData.totalPRs > 0 ? (reviewData.numberOfPRsReviewed / reviewData.totalPRs) * 100 : 0;

  const percentageOfPRsMergedWithoutReview =
    reviewData.totalMergedPRs > 0
      ? (reviewData.numberOfPRsMergedWithoutReview / reviewData.totalMergedPRs) * 100
      : 0;

  const averageTimeToFirstReview =
    reviewData.prsWithReviewTime > 0
      ? reviewData.totalTimeToFirstReview / reviewData.prsWithReviewTime
      : 0;

  const prSuccessRate =
    reviewData.totalPRs > 0 ? (reviewData.totalSuccessfulPRs / reviewData.totalPRs) * 100 : 0;

  return {
    percentageOfPRsReviewed,
    percentageOfPRsMergedWithoutReview,
    averageTimeToFirstReview,
    prSuccessRate,
  };
}

/**
 * Creates metrics for a specific time period
 */
function createTimePeriodMetrics(
  reviewData: PRReviewData,
  finalMetrics: ReturnType<typeof calculateFinalMetrics>,
  period: TimePeriod
): Record<string, number> {
  const suffix = `_${period}d`;
  return {
    [`numberOfPRsReviewed${suffix}`]: reviewData.numberOfPRsReviewed,
    [`numberOfPRsMergedWithoutReview${suffix}`]: reviewData.numberOfPRsMergedWithoutReview,
    [`percentageOfPRsReviewed${suffix}`]: finalMetrics.percentageOfPRsReviewed,
    [`percentageOfPRsMergedWithoutReview${suffix}`]:
      finalMetrics.percentageOfPRsMergedWithoutReview,
    [`averageTimeToFirstReview${suffix}`]: finalMetrics.averageTimeToFirstReview,
    [`prSuccessRate${suffix}`]: finalMetrics.prSuccessRate,
    [`totalPRs${suffix}`]: reviewData.totalPRs,
    [`totalMergedPRs${suffix}`]: reviewData.totalMergedPRs,
  };
}

/**
 * Creates the final service metrics record with all time periods
 */
function createServiceMetricsRecord(
  repo: Repository,
  timePeriodMetrics: Record<string, number>
): ServiceMetrics {
  return {
    repoId: repo.id,
    repoName: repo.name,
    organization: repo.owner.login,
    ...timePeriodMetrics,
  } as ServiceMetrics;
}

/**
 * Stores service metrics to Port
 */
async function storeServiceMetrics(record: ServiceMetrics): Promise<void> {
  const props: Record<string, unknown> = _.chain(record)
    .omit(['repoId', 'repoName'])
    .mapKeys((_value, key) => _.snakeCase(key))
    .value();

  await updateEntity('service', {
    identifier: record.repoName,
    title: record.repoName,
    properties: props,
  });
}

/**
 * Logs service metrics summary for all time periods
 */
function logServiceMetricsSummary(record: ServiceMetrics): void {
  const periods: TimePeriod[] = [1, 7, 30, 60, 90];

  console.log(`Updated service metrics for repo ${record.repoName} (${record.organization}):`);

  periods.forEach((period) => {
    const suffix = `_${period}d`;
    const totalPRs = record[`totalPRs${suffix}` as keyof ServiceMetrics] as number;
    const totalMergedPRs = record[`totalMergedPRs${suffix}` as keyof ServiceMetrics] as number;
    const reviewed = record[`numberOfPRsReviewed${suffix}` as keyof ServiceMetrics] as number;
    const mergedWithoutReview = record[
      `numberOfPRsMergedWithoutReview${suffix}` as keyof ServiceMetrics
    ] as number;
    const reviewPercentage = record[
      `percentageOfPRsReviewed${suffix}` as keyof ServiceMetrics
    ] as number;
    const mergedWithoutReviewPercentage = record[
      `percentageOfPRsMergedWithoutReview${suffix}` as keyof ServiceMetrics
    ] as number;
    const avgTimeToReview = record[
      `averageTimeToFirstReview${suffix}` as keyof ServiceMetrics
    ] as number;
    const successRate = record[`prSuccessRate${suffix}` as keyof ServiceMetrics] as number;

    console.log(`  ${period} day period:`, {
      totalPRs,
      totalMergedPRs,
      reviewed,
      mergedWithoutReview,
      reviewPercentage: `${reviewPercentage.toFixed(2)}%`,
      mergedWithoutReviewPercentage: `${mergedWithoutReviewPercentage.toFixed(2)}%`,
      avgTimeToReview: `${avgTimeToReview.toFixed(2)} hours`,
      successRate: `${successRate.toFixed(2)}%`,
    });
  });
}

/**
 * Processes service metrics for a single repository across all time periods
 */
async function processRepositoryServiceMetrics(
  githubClient: GitHubClient,
  repo: Repository,
  repoIndex: number,
  totalRepos: number
): Promise<void> {
  console.log(`Processing service metrics for repo ${repo.name} (${repoIndex + 1}/${totalRepos})`);

  try {
    const timePeriods: TimePeriod[] = [1, 7, 30, 60, 90];
    const allTimePeriodMetrics: Record<string, number> = {};

    for (const period of timePeriods) {
      console.log(`  Fetching PRs for ${period} day period...`);
      const prs = await fetchRepositoryPRs(githubClient, repo.owner.login, repo.name, period);
      console.log(`  Found ${prs.length} PRs in the last ${period} days for ${repo.name}`);

      const reviewData = await calculateRepositoryReviewMetrics(
        githubClient,
        repo.owner.login,
        repo.name,
        prs
      );
      const finalMetrics = calculateFinalMetrics(reviewData);
      const periodMetrics = createTimePeriodMetrics(reviewData, finalMetrics, period);

      Object.assign(allTimePeriodMetrics, periodMetrics);
    }

    const record = createServiceMetricsRecord(repo, allTimePeriodMetrics);
    await storeServiceMetrics(record);
    logServiceMetricsSummary(record);
  } catch (error) {
    console.error(`Failed to process service metrics for repo ${repo.name}:`, error);
    throw error;
  }
}

/**
 * Main function to calculate and store service metrics for multiple repositories
 */
export async function calculateAndStoreServiceMetrics(
  repos: Repository[],
  authToken: string
): Promise<void> {
  const githubClient = createGitHubClient(authToken);

  for (const [index, repo] of repos.entries()) {
    try {
      await processRepositoryServiceMetrics(githubClient, repo, index, repos.length);
    } catch (error) {
      console.error(`Error processing repo ${repo.name}:`, error);
      // Continue with next repo instead of failing completely
    }
  }
}
