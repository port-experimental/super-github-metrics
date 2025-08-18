import _ from 'lodash';
import { createGitHubClient, GitHubClient } from '../clients/github';
import { createEntitiesInBatches } from '../clients/port';
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubReview,
  GitHubUser,
  MemberJoinRecord,
  GitHubAppConfig,
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
  orgName: string,
  githubClient: GitHubClient
): Promise<MemberJoinRecord[]> {
  return await githubClient.getMemberAddDates(orgName);
}

export async function calculateAndStoreDeveloperStats(
  orgNames: string[],
  user: GitHubUser,
  joinDate: string,
  githubClient: GitHubClient
): Promise<PortEntity | null> {
  const stats = await getDeveloperStats(orgNames, user.identifier, joinDate, githubClient);
  const record = stats.find((rec) => rec.login === user.identifier);
  if (!record) {
    console.log(`No record found for ${user.identifier}, unprocessable, skipping...`);
    return null;
  }
  console.log(record);
  return await storeDeveloperStats(user, record);
}

export async function getDeveloperStats(
  orgNames: string[],
  login: string,
  joinDate: string,
  githubClient: GitHubClient
): Promise<DeveloperStats[]> {
  console.log(
    'Using client:',
    githubClient === githubClient ? 'injected client' : 'created client'
  );
  const stats: DeveloperStats[] = [];

  try {
    console.log(`Getting stats for ${login}`);

    // Log rate limit status at the start
    await githubClient.checkRateLimits();

    let firstCommitDate: string | null = null;
    let tenthCommitDate: string | null = null;
    let firstPRDate: string | null = null;
    let tenthPRDate: string | null = null;
    const allCommits: GitHubCommit[] = [];
    const allPulls: GitHubPullRequest[] = [];
    const allReviews: GitHubReview[] = [];

    // Create concurrent API calls for all organizations
    // Note: This processes all organizations concurrently with 3 API calls per org (commits, PRs, reviews)
    const orgDataPromises = orgNames.map(async (orgName) => {
      try {
        // Run all API calls for this org concurrently
        const [commits, pulls, reviews] = await Promise.all([
          githubClient.searchCommits(login, orgName),
          githubClient.searchPullRequests(login, orgName),
          githubClient.searchReviews(login, orgName),
        ]);

        console.log(
          `Org ${orgName} - Commits: ${commits.length}, PRs: ${pulls.length}, Reviews: ${reviews.length}`
        );

        // Convert PullRequestBasic to GitHubPullRequest
        const convertedPulls: GitHubPullRequest[] = pulls.map((pull: any) => ({
          number: pull.number,
          created_at: pull.created_at,
          closed_at: pull.closed_at,
          merged_at: pull.merged_at,
          user: pull.user,
        }));

        // Convert PullRequestReview to GitHubReview
        const convertedReviews: GitHubReview[] = reviews.map((review: any) => ({
          user: review.user,
          submitted_at: review.submitted_at,
          created_at: review.submitted_at, // Use submitted_at as fallback for created_at
        }));

        return { commits, pulls: convertedPulls, reviews: convertedReviews };
      } catch (error) {
        console.error(`Error fetching data for org ${orgName}:`, error);
        return { commits: [], pulls: [], reviews: [] };
      }
    });

    // Wait for all organization data to be fetched
    const orgDataResults = await Promise.all(orgDataPromises);

    // Aggregate all data from all organizations
    orgDataResults.forEach(({ commits, pulls, reviews }) => {
      allCommits.push(...commits);
      allPulls.push(...pulls);
      allReviews.push(...reviews);
    });

    console.log(
      `Total data collected: ${allCommits.length} commits, ${allPulls.length} PRs, ${allReviews.length} reviews`
    );

    // Sort commits by date (oldest first)
    const sortedCommits = allCommits.sort((a, b) => {
      const dateA = a.commit.author?.date || '';
      const dateB = b.commit.author?.date || '';
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    // Sort PRs by date (oldest first)
    const sortedPulls = allPulls.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Sort reviews by date (oldest first)
    const sortedReviews = allReviews.sort((a, b) => {
      const dateA = a.submitted_at || a.created_at || '';
      const dateB = b.submitted_at || b.created_at || '';
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    // Find first and tenth commit dates
    if (sortedCommits.length > 0) {
      firstCommitDate = sortedCommits[0].commit.author?.date || null;
      if (sortedCommits.length >= 10) {
        tenthCommitDate = sortedCommits[9].commit.author?.date || null;
      }
    }

    // Find first and tenth PR dates
    if (sortedPulls.length > 0) {
      firstPRDate = sortedPulls[0].created_at;
      if (sortedPulls.length >= 10) {
        tenthPRDate = sortedPulls[9].created_at;
      }
    }

    // Calculate time differences
    const joinDateObj = new Date(joinDate);
    const timeToFirstCommit = firstCommitDate
      ? new Date(firstCommitDate).getTime() - joinDateObj.getTime()
      : null;
    const timeToFirstPR = firstPRDate
      ? new Date(firstPRDate).getTime() - joinDateObj.getTime()
      : null;
    const timeTo10thCommit = tenthCommitDate
      ? new Date(tenthCommitDate).getTime() - joinDateObj.getTime()
      : null;
    const timeTo10thPR = tenthPRDate
      ? new Date(tenthPRDate).getTime() - joinDateObj.getTime()
      : null;

    // Calculate initial review response time
    let initialReviewResponseTime: number | null = null;
    if (sortedPulls.length > 0 && sortedReviews.length > 0) {
      const firstPR = sortedPulls[0];
      // Find the first review for this PR (we'll need to match by PR number)
      // Since we don't have pull_request_url in the review type, we'll use the first review
      const firstReview = sortedReviews[0];
      if (firstReview && firstReview.submitted_at) {
        initialReviewResponseTime =
          new Date(firstReview.submitted_at).getTime() - new Date(firstPR.created_at).getTime();
      }
    }

    // Convert milliseconds to days
    const timeToFirstCommitDays = timeToFirstCommit
      ? Math.round(timeToFirstCommit / (1000 * 60 * 60 * 24))
      : null;
    const timeToFirstPRDays = timeToFirstPR
      ? Math.round(timeToFirstPR / (1000 * 60 * 60 * 24))
      : null;
    const timeTo10thCommitDays = timeTo10thCommit
      ? Math.round(timeTo10thCommit / (1000 * 60 * 60 * 24))
      : null;
    const timeTo10thPRDays = timeTo10thPR ? Math.round(timeTo10thPR / (1000 * 60 * 60 * 24)) : null;
    const initialReviewResponseTimeDays = initialReviewResponseTime
      ? Math.round(initialReviewResponseTime / (1000 * 60 * 60 * 24))
      : null;

    const record: DeveloperStats = {
      login,
      joinDate,
      firstCommitDate,
      tenthCommitDate,
      firstPRDate,
      tenthPRDate,
      timeToFirstCommit: timeToFirstCommitDays,
      timeToFirstPR: timeToFirstPRDays,
      timeTo10thCommit: timeTo10thCommitDays,
      timeTo10thPR: timeTo10thPRDays,
      initialReviewResponseTime: initialReviewResponseTimeDays,
    };

    stats.push(record);

    console.log(`Completed stats for ${login}:`, {
      commits: sortedCommits.length,
      prs: sortedPulls.length,
      reviews: sortedReviews.length,
      timeToFirstCommit: timeToFirstCommitDays,
      timeToFirstPR: timeToFirstPRDays,
      timeTo10thCommit: timeTo10thCommitDays,
      timeTo10thPR: timeTo10thPRDays,
      initialReviewResponseTime: initialReviewResponseTimeDays,
    });
  } catch (error) {
    console.error(`Error getting stats for ${login}:`, error);
  }

  return stats;
}

export async function storeDeveloperStats(
  user: GitHubUser,
  record: DeveloperStats
): Promise<PortEntity> {
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

  const entity: PortEntity = {
    identifier: user.identifier,
    title: user.title || user.identifier,
    properties: props,
    relations: user.relations || {},
  };

  return entity;
}

/**
 * Stores multiple developer stats entities in Port using bulk ingestion
 */
export async function storeDeveloperStatsEntities(entities: PortEntity[]): Promise<void> {
  if (entities.length === 0) {
    console.log('No developer stats entities to store');
    return;
  }

  try {
    console.log(`Storing ${entities.length} developer stats entities using bulk ingestion...`);
    const results = await createEntitiesInBatches('githubUser', entities);

    // Aggregate results
    const totalSuccessful = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => r.created).length,
      0
    );
    const totalFailed = results.reduce(
      (sum, result) => sum + result.entities.filter((r) => !r.created).length,
      0
    );

    console.log(`Bulk ingestion completed: ${totalSuccessful} successful, ${totalFailed} failed`);

    if (totalFailed > 0) {
      const allFailed = results.flatMap((result) => result.entities.filter((r) => !r.created));
      const failedIdentifiers = allFailed.map((r) => r.identifier);
      console.warn(`Failed entities: ${failedIdentifiers.join(', ')}`);
    }
  } catch (error) {
    console.error(
      `Failed to store developer stats entities: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  }
}

export function hasCompleteOnboardingMetrics(user: PortEntity) {
  return !!(
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
