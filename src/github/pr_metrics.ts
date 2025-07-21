import _ from 'lodash';
import { createGitHubClient, type GitHubClient } from '../clients/github';
import { upsertProps } from '../clients/port';
import type { Repository, Commit } from '../types/github';
import { 
  filterDataForTimePeriod, 
  TIME_PERIODS, 
  type TimePeriod 
} from './utils';

interface PRMetrics {
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
  prMaturity: number;
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
  numberOfLineChangesAfterPRIsOpened: number;
  numberOfCommitsAfterPRIsOpened: number;
}

const getNumberOfChangesAfterPRIsOpened = async (
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  prCreationDate: Date
): Promise<{
  numberOfLineChangesAfterPRIsOpened: number;
  numberOfCommitsAfterPRIsOpened: number;
}> => {
  const commits = await githubClient.getPullRequestCommits(owner, repo, prNumber);
  const changesAfterPRIsOpened = commits.filter(
    (commit: Commit) =>
      commit.commit.author?.date &&
      commit.stats?.total &&
      new Date(commit.commit.author?.date) > prCreationDate
  );

  return {
    numberOfLineChangesAfterPRIsOpened: changesAfterPRIsOpened.reduce(
      (acc: number, commit: Commit) => acc + (commit.stats?.total ?? 0),
      0
    ),
    numberOfCommitsAfterPRIsOpened: changesAfterPRIsOpened.length,
  };
};

/**
 * Fetches all PRs for a repository within the specified time period
 */
async function fetchRepositoryPRs(
  githubClient: GitHubClient,
  owner: string,
  repoName: string,
  daysBack: number
): Promise<any[]> {
  const prs: any[] = [];
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await githubClient.makeRequestWithRetry(() =>
        githubClient['octokit'].pulls.list({
          owner,
          repo: repoName,
          state: 'closed',
          sort: 'created',
          direction: 'desc',
          per_page: 100,
          page,
        })
      );

      if (response.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const pr of response.data) {
        if (pr.created_at) {
          const prDate = new Date(pr.created_at);
          if (prDate >= cutoffDate) {
            prs.push(pr);
          } else {
            // If we've reached PRs older than our cutoff, we can stop
            hasMore = false;
            break;
          }
        }
      }

      page++;
    }
  } catch (error) {
    console.error(`Error fetching PRs for ${owner}/${repoName}:`, error);
  }

  return prs;
}

export async function calculateAndStorePRMetrics(
  repos: Repository[],
  authToken: string
): Promise<void> {
  const githubClient = createGitHubClient(authToken);
  let hasFatalError = false;
  const failedRepos: string[] = [];
  
  for (const [index, repo] of repos.entries()) {
    try {
      console.log(`Processing repo ${repo.name} (${index + 1}/${repos.length})`);
      
      // Fetch all PRs for the maximum time period (90 days) once
      const maxPeriod = TIME_PERIODS.NINETY_DAYS;
      console.log(`  Fetching PRs for ${maxPeriod} day period...`);
      const allPRs = await fetchRepositoryPRs(githubClient, repo.owner.login, repo.name, maxPeriod);
      console.log(`  Found ${allPRs.length} PRs in the last ${maxPeriod} days`);

      // Process each time period by filtering the already-fetched data
      const timePeriods: TimePeriod[] = [TIME_PERIODS.ONE_DAY, TIME_PERIODS.SEVEN_DAYS, TIME_PERIODS.THIRTY_DAYS, TIME_PERIODS.NINETY_DAYS];
      
      for (const period of timePeriods) {
        console.log(`  Processing ${period} day period...`);
        
        // Filter PRs for this time period
        const periodPRs = filterDataForTimePeriod(allPRs, period);
        console.log(`  Filtered to ${periodPRs.length} PRs for ${period} day period`);

        for (const pr of periodPRs) {
          try {
            const prData = await githubClient.getPullRequest(repo.owner.login, repo.name, pr.number);
            const reviews = await githubClient.getPullRequestReviews(
              repo.owner.login,
              repo.name,
              pr.number
            );

            const prFirstApproval =
              reviews.find((review) => review.state === 'APPROVED')?.submitted_at || null;

            const changesAfterPR = await getNumberOfChangesAfterPRIsOpened(
              githubClient,
              repo.owner.login,
              repo.name,
              pr.number,
              new Date(pr.created_at)
            );

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
                  ? (new Date(pr.closed_at).getTime() - new Date(pr.created_at).getTime()) /
                    (1000 * 60 * 60 * 24)
                  : null,
              prPickupTime:
                reviews.length > 0 && reviews[0].submitted_at && pr.created_at
                  ? (new Date(reviews[0].submitted_at).getTime() - new Date(pr.created_at).getTime()) /
                    (1000 * 60 * 60 * 24)
                  : null,
              prApproveTime:
                reviews.length > 0 && reviews[0].submitted_at && prFirstApproval
                  ? (new Date(prFirstApproval).getTime() -
                      new Date(reviews[0].submitted_at).getTime()) /
                    (1000 * 60 * 60 * 24)
                  : null,
              prMergeTime:
                prFirstApproval && pr.merged_at
                  ? (new Date(pr.merged_at).getTime() - new Date(prFirstApproval).getTime()) /
                    (1000 * 60 * 60 * 24)
                  : null,
              prMaturity:
                prData.additions + prData.deletions > 0
                  ? Math.max(
                      0,
                      (prData.additions +
                        prData.deletions -
                        changesAfterPR.numberOfLineChangesAfterPRIsOpened) /
                        (prData.additions + prData.deletions)
                    )
                  : 1.0,
              prSuccessRate: pr.merged_at ? 1 : 0,
              reviewParticipation: reviews.length > 0 ? reviews.length : 0,
              comments: prData.comments,
              reviewComments: prData.review_comments,
            };

            const props: Record<string, unknown> = _.chain(record)
              .pick([
                'prSize',
                'prLifetime',
                'prPickupTime',
                'prApproveTime',
                'prMergeTime',
                'prMaturity',
                'prSuccessRate',
                'reviewParticipation',
                'numberOfLineChangesAfterPRIsOpened',
                'numberOfCommitsAfterPRIsOpened',
              ])
              .mapKeys((_value, key) => _.snakeCase(key))
              .value();

            await upsertProps(
              'githubPullRequest',
              `${record.repoName}-${record.pullRequestId}`,
              props
            );
          } catch (error) {
            console.error(`Failed to update PR ${repo.name}-${pr.id}:`, error);
            // Continue with next PR instead of failing the entire repo
          }
        }
      }
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
    console.warn(`Warning: Failed to process ${failedRepos.length} repositories: ${failedRepos.join(', ')}`);
  }

  // If there were any fatal errors and no successful processing, throw an error
  if (hasFatalError && failedRepos.length === repos.length) {
    throw new Error('All repositories failed to process');
  }
}
