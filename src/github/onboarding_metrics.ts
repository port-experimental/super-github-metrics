import _ from 'lodash';
import { createGitHubClient } from '../clients/github';
import { upsertEntity } from '../clients/port';
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubReview,
  GitHubUser,
  MemberJoinRecord,
} from '../types/github';
import type { PortEntity } from '../types/port';

interface DeveloperStats {
  login: string;
  joinDate: string | null;
  firstCommitDate: string | null;
  tenthCommitDate: string | null;
  firstPRDate: string | null;
  tenthPRDate: string | null;
  timeToFirstCommit: number | null;
  timeToFirstPR: number | null;
  timeTo10thCommit: number | null;
  timeTo10thPR: number | null;
  initialReviewResponseTime: number | null;
}

export async function getMemberAddDates(
  enterprise: string,
  authToken: string
): Promise<MemberJoinRecord[]> {
  const githubClient = createGitHubClient(authToken);
  return await githubClient.getMemberAddDates(enterprise);
}

export async function calculateAndStoreDeveloperStats(
  orgNames: string[],
  authToken: string,
  user: GitHubUser,
  joinDate: string
): Promise<void> {
  const stats = await getDeveloperStats(orgNames, authToken, user.identifier, joinDate);
  const record = stats.find((rec) => rec.login === user.identifier);
  if (!record) {
    console.log(`No record found for ${user.identifier}, unprocessable, skipping...`);
    return;
  }
  console.log(record);
  return await storeDeveloperStats(user, record);
}

export async function getDeveloperStats(
  orgNames: string[],
  authToken: string,
  login: string,
  joinDate: string
): Promise<DeveloperStats[]> {
  const githubClient = createGitHubClient(authToken);
  const stats: DeveloperStats[] = [];

  try {
    console.log(`Getting stats for ${login}`);

    // Log rate limit status at the start
    const rateLimitStatus = await githubClient.getRateLimitStatus();
    console.log(
      `Rate limit status: ${rateLimitStatus.remaining}/${rateLimitStatus.limit} requests remaining, resets in ${rateLimitStatus.secondsUntilReset} seconds`
    );

    let firstCommitDate: string | null = null;
    let tenthCommitDate: string | null = null;
    let firstPRDate: string | null = null;
    let tenthPRDate: string | null = null;
    const allCommits: GitHubCommit[] = [];
    const allPulls: GitHubPullRequest[] = [];
    const allReviews: GitHubReview[] = [];

    for (const orgName of orgNames) {
      // Search for first commit
      const commits = await githubClient.searchCommits(login, orgName);
      allCommits.push(...commits);

      // Search for first pull request
      const pulls = await githubClient.searchPullRequests(login, orgName);
      // Convert PullRequestBasic to GitHubPullRequest
      const convertedPulls: GitHubPullRequest[] = pulls.map((pull) => ({
        number: pull.number,
        created_at: pull.created_at,
        closed_at: pull.closed_at,
        merged_at: pull.merged_at,
        user: pull.user,
      }));
      allPulls.push(...convertedPulls);

      // Search for reviews
      const reviews = await githubClient.searchReviews(login, orgName);
      // Convert PullRequestReview to GitHubReview
      const convertedReviews: GitHubReview[] = reviews.map((review) => ({
        user: review.user,
        submitted_at: review.submitted_at,
        created_at: review.submitted_at, // Use submitted_at as fallback for created_at
      }));
      allReviews.push(...convertedReviews);
    }

    allCommits.sort(
      (a, b) =>
        new Date(a.commit.author?.date || 0).getTime() -
        new Date(b.commit.author?.date || 0).getTime()
    );
    if (allCommits.length > 0) {
      firstCommitDate = allCommits.length > 0 ? allCommits[0].commit.author?.date || null : null;
      tenthCommitDate = allCommits.length > 9 ? allCommits[9].commit.author?.date || null : null;
    }
    allPulls.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (allPulls.length > 0) {
      firstPRDate = allPulls.length > 0 ? allPulls[0].created_at : null;
      tenthPRDate = allPulls.length > 9 ? allPulls[9].created_at : null;
    }

    const firstReviewDate =
      allReviews.length > 0
        ? allReviews.sort(
            (a, b) =>
              new Date(a.submitted_at || a.created_at || '').getTime() -
              new Date(b.submitted_at || b.created_at || '').getTime()
          )[0].submitted_at ||
          allReviews[0].created_at ||
          null
        : null;

    const record: DeveloperStats = {
      login: login,
      joinDate,
      firstCommitDate,
      tenthCommitDate,
      firstPRDate,
      tenthPRDate,
      timeToFirstCommit: null,
      timeToFirstPR: null,
      timeTo10thCommit: null,
      timeTo10thPR: null,
      initialReviewResponseTime: null,
    };

    if (joinDate) {
      record.timeToFirstCommit = firstCommitDate
        ? (new Date(firstCommitDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60)
        : null;
      record.timeToFirstPR = firstPRDate
        ? (new Date(firstPRDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60)
        : null;
      record.timeTo10thCommit = tenthCommitDate
        ? (new Date(tenthCommitDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60)
        : null;
      record.timeTo10thPR = tenthPRDate
        ? (new Date(tenthPRDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60)
        : null;
      record.initialReviewResponseTime = firstReviewDate
        ? (new Date(firstReviewDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60)
        : null;
    }

    stats.push(record);
    console.log(stats);
    return stats;
  } catch (error) {
    throw new Error(`Failed to fetch developer stats for ${login}: ${error}`);
  }
}

export async function storeDeveloperStats(user: GitHubUser, record: DeveloperStats) {
  const props: Record<string, unknown> = _.chain(record)
    .pick([
      'login',
      'joinDate',
      'firstCommitDate',
      'tenthCommitDate',
      'firstPRDate',
      'tenthPRDate',
      'initialReviewResponseTime',
      'timeToFirstCommit',
      'timeToFirstPR',
      'timeTo10thCommit',
      'timeTo10thPR',
    ])
    .mapKeys((_value, key) =>
      key !== 'joinDate' ? _.snakeCase(key.replace('Date', '')) : 'join_date'
    )
    .value();

  try {
    console.log(`attempting to update ${user.identifier}`);
    console.log(`Setting props: ${JSON.stringify(props)}`);
    await upsertEntity(
      'githubUser',
      user.identifier,
      user.title || '',
      props,
      user.relations || {}
    );
    console.log(`Updated first commit and PR dates for user ${user.identifier}`);
  } catch (error) {
    console.error(`Failed to update user ${user.identifier}:`, error);
  }
}

export function hasCompleteOnboardingMetrics(user: PortEntity) {
  return (
    user.properties?.first_commit &&
    user.properties?.tenth_commit &&
    user.properties?.first_pr &&
    user.properties?.tenth_pr &&
    user.properties?.time_to_first_commit &&
    user.properties?.time_to_first_pr &&
    user.properties?.time_to_10th_commit &&
    user.properties?.time_to_10th_pr &&
    user.properties?.initial_review_response_time
  );
}
