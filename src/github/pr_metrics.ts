import _ from 'lodash';
import { upsertProps } from '../clients/port';
import { createGitHubClient } from '../clients/github';

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
    // PR First Comment: (First review timestamp)
    prFirstComment: string | null;
    // PR First Approval: (First approval timestamp)
    prFirstApproval: string | null;
    // Number of changes after PR is opened
    numberOfLineChangesAfterPRIsOpened: number;
    numberOfCommitsAfterPRIsOpened: number;
    
}

const getNumberOfChangesAfterPRIsOpened = async (githubClient: any, owner: string, repo: string, prNumber: number, prCreationDate: Date): Promise<{
    numberOfLineChangesAfterPRIsOpened: number;
    numberOfCommitsAfterPRIsOpened: number;
}> => {
    const commits = await githubClient.getPullRequestCommits(owner, repo, prNumber);
    const changesAfterPRIsOpened = commits.filter((commit: any) => commit.commit.author?.date && commit.stats?.total)
        .filter((commit: any) => new Date(commit.commit.author?.date!) > prCreationDate);

    return {
        numberOfLineChangesAfterPRIsOpened: changesAfterPRIsOpened.reduce((acc: number, commit: any) => acc + commit.stats?.total!, 0),
        numberOfCommitsAfterPRIsOpened: changesAfterPRIsOpened.length
    };
}

export async function calculateAndStorePRMetrics(repos: any[], authToken: string): Promise<void> {
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
                page: page
            });

            // Filter PRs created in last 90 days
            const recentPRs = prs.filter(pr => new Date(pr.created_at) > ninetyDaysAgo);
            console.log(`Found ${recentPRs.length} PRs in the last 90 days`);
            for (const pr of recentPRs) {
                const prData = await githubClient.getPullRequest(repo.owner.login, repo.name, pr.number);
                const reviews = await githubClient.getPullRequestReviews(repo.owner.login, repo.name, pr.number);

                const record: PRMetrics = {
                    repoId: repo.id,
                    repoName: repo.name,
                    pullRequestId: pr.id.toString(),
                    prSize: prData.additions + prData.deletions,
                    prAdditions: prData.additions,
                    prDeletions: prData.deletions,
                    prFilesChanged: prData.changed_files,
                    prFirstComment: reviews[0]?.submitted_at || null,
                    prFirstApproval: reviews.find(review => review.state === 'APPROVED')?.submitted_at || null,
                    ...(await getNumberOfChangesAfterPRIsOpened(
                        githubClient,
                        repo.owner.login,
                        repo.name,
                        pr.number,
                        new Date(pr.created_at)
                    )),
                    // times expressed in hours
                    prLifetime: pr.closed_at && pr.created_at ? (new Date(pr.closed_at).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60) : 0,
                    prPickupTime: reviews.length > 0 && reviews[0].submitted_at && pr.created_at ? (new Date(reviews[0].submitted_at).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60) : 0,
                    prSuccessRate: pr.merged_at ? 1 : 0,
                    reviewParticipation: reviews.length > 0 ? reviews.length : 0,
                    comments: prData.comments,
                    reviewComments: prData.review_comments,
                };

                const props: Record<string, any> = _.chain(record)
                .pick(['prSize', 'prLifetime', 'prPickupTime', 'prSuccessRate', 'reviewParticipation', 'numberOfLineChangesAfterPRIsOpened', 'numberOfCommitsAfterPRIsOpened'])
                .mapKeys((_value, key) => _.snakeCase(key));
                
                try {
                  await upsertProps(
                    'githubPullRequest',
                    `${record.repoName}-${record.pullRequestId}`,
                    props,
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


