import { Octokit } from '@octokit/rest';
import _ from 'lodash';
import { upsertProps } from './port_client';

interface PRMetrics {
    repoId: string;
    repoName: string;
    pullRequestId: string;
    // PR Size: Sum(lines added + lines deleted)
    prSize: number;
    // PR Lifetime: (PR close timestamp) - (PR creation timestamp)
    prLifetime: number;
    // PR Pickup Time: (First review timestamp) - (PR creation timestamp)
    prPickupTime: number;
    // PR Success Rate: (# of merged PRs / total # of closed PRs) × 100
    prSuccessRate: number;
    // Review Participation: Average reviewers per PR
    reviewParticipation: number;
    prAdditions: number;
    prDeletions: number;
    prFilesChanged: number;
    comments: number;
    reviewComments: number;
}

export async function calculateAndStorePRMetrics(repos: any[], authToken: string): Promise<void> {
    const octokit = new Octokit({ auth: authToken });
    for (const repo of repos) {
        const { data: prs } = await octokit.rest.pulls.list({
            owner: repo.owner.login,
            repo: repo.name,
            per_page: 100,
            state: 'closed',
        });

        for (const pr of prs) {
            const { data: prData } = await octokit.rest.pulls.get({
                owner: repo.owner.login,
                repo: repo.name,
                pull_number: pr.number,
            });

            const { data: reviews } = await octokit.rest.pulls.listReviews({
                owner: repo.owner.login,
                repo: repo.name,
                pull_number: pr.number,
            });

            const record: PRMetrics = {
                repoId: repo.id,
                repoName: repo.name,
                pullRequestId: pr.id.toString(),
                prSize: prData.additions + prData.deletions,
                prAdditions: prData.additions,
                prDeletions: prData.deletions,
                prFilesChanged: prData.changed_files,
                // times expressed in hours
                prLifetime: pr.closed_at && pr.created_at ? (new Date(pr.closed_at).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60) : 0,
                prPickupTime: reviews.length > 0 && reviews[0].submitted_at && pr.created_at ? (new Date(reviews[0].submitted_at).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60) : 0,
                prSuccessRate: pr.merged_at ? 1 : 0,
                reviewParticipation: reviews.length > 0 ? reviews.length : 0,
                comments: prData.comments,
                reviewComments: prData.review_comments,
            };

            const props: Record<string, any> = _.chain(record)
            .pick(['prSize', 'prLifetime', 'prPickupTime', 'prSuccessRate', 'reviewParticipation'])
            .mapKeys((_value, key) => _.snakeCase(key));
            
            try {
              console.log(`attempting to update ${record.repoName}-${record.pullRequestId}`);
              await upsertProps(
                'githubPullRequest',
                `${record.repoName}-${record.pullRequestId}`,
                props,
              );
              console.log(`Updated PR metrics for repo ${record.repoName}-${record.pullRequestId}`);
            } catch (error) {
              console.error(`Failed to update repo ${record.repoName}-${record.pullRequestId}:`, error);
            }
        }
    }
}


