import _ from 'lodash';
import {
  type Commit,
  createGitHubClient,
  type GitHubClient,
  type Repository,
} from '../clients/github';
import { upsertProps } from '../clients/port';

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

export async function calculateAndStorePRMetrics(
  repos: Repository[],
  authToken: string
): Promise<void> {
  const githubClient = createGitHubClient(authToken);
  for (const [index, repo] of repos.entries()) {
    console.log(`Processing repo ${repo.name} (${index + 1}/${repos.length})`);
    let page = 1;
    let hasMore = true;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    while (hasMore) {
      const prs = await githubClient.getPullRequests(repo.owner.login, repo.name, {
        state: 'closed',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page: page,
      });

      // Filter PRs created in last 90 days
      const recentPRs = prs.filter((pr) => new Date(pr.created_at) > ninetyDaysAgo);
      console.log(`Found ${recentPRs.length} PRs in the last 90 days`);
      for (const pr of recentPRs) {
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

        try {
          await upsertProps(
            'githubPullRequest',
            `${record.repoName}-${record.pullRequestId}`,
            props
          );
        } catch (error) {
          console.error(`Failed to update repo ${record.repoName}-${record.pullRequestId}:`, error);
        }
      }

      // If we got less than 100 PRs or the oldest PR is older than 90 days, we're done
      hasMore = recentPRs.length === 100;
      page++;
    }
  }
}
