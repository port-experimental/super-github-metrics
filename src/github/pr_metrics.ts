import type { GitHubClient } from '../clients/github';
import type { PRCommitsResult, PRFullDataResult } from '../clients/github/graphql';
import type { PullRequestBasic, Repository } from '../clients/github/types';
import { upsertEntitiesInBatches } from '../clients/port';
import type { PortEntity } from '../clients/port/types';
import { buildPrIdentifier, getPrBlueprint, getRepositoryRelationKey } from '../env';
import { CONCURRENCY_LIMITS, TIME_PERIODS } from './utils';

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
  prCreationDate: Date
): Promise<{
  numberOfLineChangesAfterPRIsOpened: number | null;
  numberOfCommitsAfterPRIsOpened: number | null;
}> => {
  try {
    const commits = await githubClient.getPullRequestCommits(owner, repo, prNumber);
    const commitsAfterPR = commits.filter((commit) => {
      const commitDate = new Date(commit.commit.author?.date || '');
      return commitDate > prCreationDate;
    });

    const numberOfLineChangesAfterPRIsOpened = commitsAfterPR.reduce((total, commit) => {
      return total + (commit.stats?.total || 0);
    }, 0);

    return {
      numberOfLineChangesAfterPRIsOpened,
      numberOfCommitsAfterPRIsOpened: commitsAfterPR.length,
    };
  } catch (error) {
    console.error(`Error getting changes after PR ${prNumber} is opened:`, error);
    return {
      numberOfLineChangesAfterPRIsOpened: null,
      numberOfCommitsAfterPRIsOpened: null,
    };
  }
};

/**
 * Calculate changes after PR is opened from pre-fetched batch data.
 * This avoids making additional API calls by using data already fetched via GraphQL.
 */
export function calculateChangesAfterPRFromBatch(
  commitsData: PRCommitsResult | undefined,
  prCreationDate: Date
): {
  numberOfLineChangesAfterPRIsOpened: number | null;
  numberOfCommitsAfterPRIsOpened: number | null;
} {
  if (!commitsData || !commitsData.commits) {
    return {
      numberOfLineChangesAfterPRIsOpened: null,
      numberOfCommitsAfterPRIsOpened: null,
    };
  }

  const commitsAfterPR = commitsData.commits.filter((commit) => {
    const commitDate = new Date(commit.committedDate);
    return commitDate > prCreationDate;
  });

  const numberOfLineChangesAfterPRIsOpened = commitsAfterPR.reduce((total, commit) => {
    return total + commit.additions + commit.deletions;
  }, 0);

  return {
    numberOfLineChangesAfterPRIsOpened,
    numberOfCommitsAfterPRIsOpened: commitsAfterPR.length,
  };
}

/**
 * Build PR metrics from pre-fetched batch data.
 * This processes PR data without making any API calls.
 */
export function buildPRMetricsFromBatchData(
  pr: PullRequestBasic,
  prFullData: PRFullDataResult | undefined,
  commitsData: PRCommitsResult | undefined,
  repoId: string,
  repoName: string
): PRMetrics | null {
  if (!prFullData) {
    return null;
  }

  const reviews = prFullData.reviews || [];
  const prFirstApproval =
    reviews.find((review) => review.state === 'APPROVED')?.submittedAt || null;
  const firstReview = reviews[0];

  const changesAfterPR = calculateChangesAfterPRFromBatch(
    commitsData,
    new Date(prFullData.createdAt)
  );

  const prSize = prFullData.additions + prFullData.deletions;

  return {
    repoId,
    repoName,
    prNumber: pr.number,
    pullRequestId: pr.id.toString(),
    prSize,
    prAdditions: prFullData.additions,
    prDeletions: prFullData.deletions,
    prFilesChanged: prFullData.changedFiles,
    prFirstComment: firstReview?.submittedAt || null,
    prFirstApproval,
    ...changesAfterPR,
    // times expressed in days
    prLifetime:
      prFullData.closedAt && prFullData.createdAt
        ? (new Date(prFullData.closedAt).getTime() - new Date(prFullData.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
        : null,
    prPickupTime:
      firstReview?.submittedAt && prFullData.createdAt
        ? (new Date(firstReview.submittedAt).getTime() - new Date(prFullData.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
        : null,
    prApproveTime:
      firstReview?.submittedAt && prFirstApproval
        ? (new Date(prFirstApproval).getTime() - new Date(firstReview.submittedAt).getTime()) /
          (1000 * 60 * 60 * 24)
        : null,
    prMergeTime:
      prFullData.mergedAt && prFirstApproval
        ? (new Date(prFullData.mergedAt).getTime() - new Date(prFirstApproval).getTime()) /
          (1000 * 60 * 60 * 24)
        : null,
    prMaturity:
      changesAfterPR.numberOfLineChangesAfterPRIsOpened !== null && prSize > 0
        ? changesAfterPR.numberOfLineChangesAfterPRIsOpened / prSize
        : null,
    prSuccessRate: prFullData.mergedAt ? 100 : 0,
    reviewParticipation: reviews.length,
    comments: prFullData.comments,
    reviewComments: prFullData.reviewThreads,
  };
}

export async function fetchRepositoryPRs(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number
): Promise<PullRequestBasic[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const allPRs: PullRequestBasic[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const prs = await githubClient.getPullRequests(owner, repoName, {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
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
      console.error(`Error fetching PRs for ${owner}/${repoName} page ${page}:`, error);
      hasMore = false;
    }
  }

  return allPRs;
}

export async function calculateAndStorePRMetrics(
  repos: Repository[],
  githubClient: GitHubClient
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
      `Processing PR metrics batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(repos.length / concurrencyLimit)} (${batch.length} repos)`
    );

    const batchPromises = batch.map(async (repo, batchIndex) => {
      const repoIndex = i + batchIndex;
      try {
        console.log(`Processing repo ${repo.name} (${repoIndex + 1}/${repos.length})`);

        // Fetch all PRs for the maximum time period (90 days) once
        const maxPeriod = TIME_PERIODS.NINETY_DAYS;
        console.log(`  Fetching PRs for ${maxPeriod} day period...`);
        const allPRs = await fetchRepositoryPRs(
          githubClient,
          repo.owner.login,
          repo.name,
          maxPeriod
        );
        console.log(`  Found ${allPRs.length} PRs in the last ${maxPeriod} days`);

        if (allPRs.length === 0) {
          console.log(`  No PRs found for ${repo.name}, skipping...`);
          return { success: true, repoName: repo.name, entities: [] };
        }

        // BATCH FETCH: Fetch all PR data upfront using GraphQL batching
        // This dramatically reduces API calls: ~6 calls for 100 PRs instead of ~300
        const prNumbers = allPRs.map((pr) => pr.number);
        console.log(`  Fetching data for ${prNumbers.length} PRs using batched GraphQL...`);

        const [prFullDataMap, prCommitsMap] = await Promise.all([
          githubClient.getPullRequestFullDataBatch(repo.owner.login, repo.name, prNumbers),
          githubClient.getPullRequestCommitsBatch(repo.owner.login, repo.name, prNumbers),
        ]);

        console.log(
          `  Fetched full data for ${prFullDataMap.size} PRs, commits for ${prCommitsMap.size} PRs`
        );

        // Create Port entities for each PR (matches githubPullRequest schema)
        const repoEntities: PortEntity[] = [];
        const seenEntityIdentifiers = new Set<string>();

        for (const pr of allPRs) {
          const prFullData = prFullDataMap.get(pr.number);
          const commitsData = prCommitsMap.get(pr.number);

          const metrics = buildPRMetricsFromBatchData(
            pr,
            prFullData,
            commitsData,
            repo.id.toString(),
            repo.name
          );

          if (!metrics) continue;

          const identifier = buildPrIdentifier(repo.name, metrics.prNumber);
          if (seenEntityIdentifiers.has(identifier)) continue;
          seenEntityIdentifiers.add(identifier);

          repoEntities.push({
            identifier,
            title: `${repo.name} #${metrics.prNumber}`,
            properties: {
              pr_size: metrics.prSize,
              pr_lifetime: metrics.prLifetime,
              pr_pickup_time: metrics.prPickupTime,
              pr_approve_time: metrics.prApproveTime,
              pr_merge_time: metrics.prMergeTime,
              pr_maturity: metrics.prMaturity,
              pr_success_rate: metrics.prSuccessRate,
              review_participation: metrics.reviewParticipation,
              number_of_line_changes_after_pr_is_opened: metrics.numberOfLineChangesAfterPRIsOpened,
              number_of_commits_after_pr_is_opened: metrics.numberOfCommitsAfterPRIsOpened,
            },
            relations: {
              [getRepositoryRelationKey()]: repo.name,
            },
          });
        }

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
    console.log('Successfully stored PR metrics entities');
  }

  // Print summary
  console.log('\n=== PR Metrics Processing Summary ===');
  console.log(`Total repositories processed: ${results.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`Failed: ${failedRepos.length}`);
  console.log(`Total entities created: ${allEntities.length}`);

  if (failedRepos.length > 0) {
    console.log('\nFailed repositories:');
    failedRepos.forEach((repoName) => {
      console.log(`- ${repoName}`);
    });
  }

  if (hasFatalError) {
    throw new Error('Failed to process PR metrics for one or more repositories');
  }
}

/**
 * Stores multiple PR metrics entities in Port using bulk ingestion
 */
export async function storePRMetricsEntities(entities: PortEntity[]): Promise<void> {
  if (entities.length === 0) {
    console.log('No PR metrics entities to store');
    return;
  }

  try {
    console.log(`Storing ${entities.length} PR metrics entities using bulk ingestion...`);
    const results = await upsertEntitiesInBatches(getPrBlueprint(), entities);

    // Aggregate results - check both entities array and errors array
    const totalSuccessful = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => r.created).length,
      0
    );
    const totalFailed = results.reduce((sum, result) => {
      const failedFromEntities = result.entities.filter((r) => !r.created).length;
      const failedFromErrors = result.errors ? result.errors.length : 0;
      return sum + failedFromEntities + failedFromErrors;
    }, 0);

    console.log(`Bulk ingestion completed: ${totalSuccessful} successful, ${totalFailed} failed`);

    if (totalFailed > 0) {
      // Collect all failed entities from both sources
      const allFailed = results.flatMap((result) => {
        const failedFromEntities = result.entities.filter((r) => !r.created);
        const failedFromErrors = result.errors || [];
        return [...failedFromEntities, ...failedFromErrors];
      });

      const failedIdentifiers = allFailed.map((r) => r.identifier);
      console.warn(`Failed entities: ${failedIdentifiers.join(', ')}`);

      // Log detailed error information
      const errors = results.flatMap((result) => result.errors || []);
      if (errors.length > 0) {
        console.warn('Detailed error information:');
        errors.forEach((error) => {
          console.warn(`  - ${error.identifier}: ${error.message} (${error.statusCode})`);
        });
      }
    }
  } catch (error) {
    console.error(
      `Failed to store PR metrics entities: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  }
}
