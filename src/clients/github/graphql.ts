import { graphql as octokitGraphql } from '@octokit/graphql';
import type { Logger } from 'pino';

/**
 * Result of fetching PR review data via GraphQL
 */
export interface PRReviewResult {
  prNumber: number;
  hasReviews: boolean;
  firstReviewSubmittedAt?: string;
}

/**
 * Review data from GraphQL response
 */
export interface PRReviewData {
  submittedAt: string;
  state: string;
  author?: {
    login: string;
  } | null;
}

/**
 * Full PR data result from GraphQL batch query
 */
export interface PRFullDataResult {
  number: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  reviewThreads: number;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  state: string;
  isDraft: boolean;
  reviews: PRReviewData[];
}

/**
 * Commit data from GraphQL response
 */
export interface PRCommitData {
  committedDate: string;
  additions: number;
  deletions: number;
  author?: {
    name: string | null;
  } | null;
}

/**
 * PR commits result from GraphQL batch query
 */
export interface PRCommitsResult {
  number: number;
  commits: PRCommitData[];
}

/**
 * GraphQL response structure for repository query
 */
interface RepositoryQueryResponse {
  repository: {
    [key: string]: {
      number: number;
      reviews: {
        nodes: Array<{
          submittedAt: string;
        }>;
      };
    } | null;
  };
}

/**
 * Maximum number of PRs that can be queried in a single GraphQL request for simple queries.
 * GitHub's GraphQL API has complexity limits.
 */
export const GRAPHQL_BATCH_SIZE = 50;

/**
 * Maximum number of PRs for full data query (lower due to nested review/author data complexity)
 * The full data query includes reviews with author info which increases query complexity.
 */
export const GRAPHQL_FULL_DATA_BATCH_SIZE = 20;

/**
 * Maximum number of PRs for commits query (lower due to nested commit data complexity)
 */
export const GRAPHQL_COMMITS_BATCH_SIZE = 25;

/**
 * Smaller batch size to use when retrying after 502/503 errors
 */
export const GRAPHQL_RETRY_BATCH_SIZE = 5;

/**
 * Maximum number of retry attempts at minimum batch size before giving up
 */
export const GRAPHQL_MAX_RETRIES = 3;

/**
 * Base delay in ms for exponential backoff (doubles each retry)
 */
export const GRAPHQL_RETRY_BASE_DELAY = 2000;

/**
 * Builds a GraphQL query for fetching reviews of multiple PRs.
 * Each PR gets an aliased field (pr0, pr1, etc.) to allow multiple
 * pullRequest queries in a single request.
 */
export function buildPRReviewQuery(prNumbers: number[]): string {
  if (prNumbers.length === 0) {
    throw new Error('Cannot build query for empty PR list');
  }

  if (prNumbers.length > GRAPHQL_BATCH_SIZE) {
    throw new Error(
      `Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs. Got ${prNumbers.length}.`
    );
  }

  const prQueries = prNumbers
    .map(
      (num, i) =>
        `pr${i}: pullRequest(number: ${num}) {
      number
      reviews(first: 1, states: [APPROVED, CHANGES_REQUESTED, COMMENTED]) {
        nodes { submittedAt }
      }
    }`
    )
    .join('\n    ');

  return `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        ${prQueries}
      }
    }
  `;
}

/**
 * Parses the GraphQL response into a structured list of PR review results.
 */
export function parseReviewResponse(
  response: RepositoryQueryResponse,
  prNumbers: number[]
): PRReviewResult[] {
  const results: PRReviewResult[] = [];

  for (let i = 0; i < prNumbers.length; i++) {
    const prData = response.repository[`pr${i}`];

    if (!prData) {
      // PR not found or inaccessible - treat as no reviews
      results.push({
        prNumber: prNumbers[i],
        hasReviews: false,
      });
      continue;
    }

    const reviews = prData.reviews?.nodes || [];
    const hasReviews = reviews.length > 0;
    const firstReviewSubmittedAt = hasReviews ? reviews[0].submittedAt : undefined;

    results.push({
      prNumber: prData.number,
      hasReviews,
      firstReviewSubmittedAt,
    });
  }

  return results;
}

/**
 * Fetches reviews for multiple PRs in a single GraphQL request.
 * This dramatically reduces API calls compared to fetching reviews one PR at a time.
 *
 * @param token - GitHub authentication token
 * @param owner - Repository owner (org or user)
 * @param repo - Repository name
 * @param prNumbers - Array of PR numbers to fetch reviews for (max 50)
 * @param logger - Optional logger for debugging
 * @returns Array of PR review results
 */
export async function fetchPRReviewsBatch(
  token: string,
  owner: string,
  repo: string,
  prNumbers: number[],
  logger?: Logger
): Promise<PRReviewResult[]> {
  if (prNumbers.length === 0) {
    return [];
  }

  if (prNumbers.length > GRAPHQL_BATCH_SIZE) {
    throw new Error(
      `Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs. Got ${prNumbers.length}. ` +
        `Split into smaller batches before calling this function.`
    );
  }

  const query = buildPRReviewQuery(prNumbers);

  try {
    const graphqlWithAuth = octokitGraphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });

    const response = (await graphqlWithAuth(query, {
      owner,
      repo,
    })) as RepositoryQueryResponse;

    const results = parseReviewResponse(response, prNumbers);

    logger?.debug(
      {
        owner,
        repo,
        prCount: prNumbers.length,
        reviewedCount: results.filter((r) => r.hasReviews).length,
      },
      `Fetched reviews for ${prNumbers.length} PRs in single GraphQL request`
    );

    return results;
  } catch (error: unknown) {
    // Handle rate limit errors specifically
    if (error instanceof Error && error.message.includes('rate limit exceeded')) {
      logger?.error({ owner, repo, error: error.message }, 'GraphQL rate limit exceeded');
      throw new Error(`GraphQL rate limit exceeded while fetching PR reviews for ${owner}/${repo}`);
    }

    // Handle other GraphQL errors
    logger?.error(
      { owner, repo, error: error instanceof Error ? error.message : error },
      'GraphQL error fetching PR reviews'
    );
    throw error;
  }
}

/**
 * Fetches reviews for a large number of PRs by splitting into batches.
 * Each batch is a single GraphQL request, dramatically reducing API calls.
 *
 * @param token - GitHub authentication token
 * @param owner - Repository owner (org or user)
 * @param repo - Repository name
 * @param prNumbers - Array of PR numbers to fetch reviews for (any size)
 * @param logger - Optional logger for debugging
 * @returns Map of PR number to review data
 */
export async function fetchAllPRReviewsBatched(
  token: string,
  owner: string,
  repo: string,
  prNumbers: number[],
  logger?: Logger
): Promise<Map<number, { hasReviews: boolean; firstReviewAt?: string }>> {
  const allReviews = new Map<number, { hasReviews: boolean; firstReviewAt?: string }>();

  if (prNumbers.length === 0) {
    return allReviews;
  }

  // Split into batches
  for (let i = 0; i < prNumbers.length; i += GRAPHQL_BATCH_SIZE) {
    const batch = prNumbers.slice(i, i + GRAPHQL_BATCH_SIZE);
    const batchNumber = Math.floor(i / GRAPHQL_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(prNumbers.length / GRAPHQL_BATCH_SIZE);

    logger?.debug(
      { owner, repo, batch: batchNumber, totalBatches, batchSize: batch.length },
      `Fetching PR reviews batch ${batchNumber}/${totalBatches}`
    );

    const results = await fetchPRReviewsBatch(token, owner, repo, batch, logger);

    for (const result of results) {
      allReviews.set(result.prNumber, {
        hasReviews: result.hasReviews,
        firstReviewAt: result.firstReviewSubmittedAt,
      });
    }
  }

  logger?.info(
    {
      owner,
      repo,
      totalPRs: prNumbers.length,
      totalBatches: Math.ceil(prNumbers.length / GRAPHQL_BATCH_SIZE),
      reviewedPRs: Array.from(allReviews.values()).filter((v) => v.hasReviews).length,
    },
    `Completed fetching reviews for ${prNumbers.length} PRs using ${Math.ceil(prNumbers.length / GRAPHQL_BATCH_SIZE)} GraphQL request(s)`
  );

  return allReviews;
}

// ============================================================================
// PR Full Data (details + reviews) Query Functions
// ============================================================================

/**
 * GraphQL response structure for full PR data query
 */
interface PRFullDataQueryResponse {
  repository: {
    [key: string]: {
      number: number;
      additions: number;
      deletions: number;
      changedFiles: number;
      comments: {
        totalCount: number;
      };
      reviewThreads: {
        totalCount: number;
      };
      createdAt: string;
      mergedAt: string | null;
      closedAt: string | null;
      state: string;
      isDraft: boolean;
      reviews: {
        nodes: Array<{
          submittedAt: string;
          state: string;
          author?: {
            login: string;
          } | null;
        }>;
      };
    } | null;
  };
}

/**
 * Builds a GraphQL query for fetching full PR data (details + reviews) for multiple PRs.
 * Each PR gets an aliased field (pr0, pr1, etc.) to allow multiple pullRequest queries.
 *
 * @param prNumbers - Array of PR numbers to query (max 50)
 * @returns GraphQL query string
 */
export function buildPRFullDataQuery(prNumbers: number[]): string {
  if (prNumbers.length === 0) {
    throw new Error('Cannot build query for empty PR list');
  }

  if (prNumbers.length > GRAPHQL_BATCH_SIZE) {
    throw new Error(
      `Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs. Got ${prNumbers.length}.`
    );
  }

  const prQueries = prNumbers
    .map(
      (num, i) =>
        `pr${i}: pullRequest(number: ${num}) {
      number
      additions
      deletions
      changedFiles
      comments { totalCount }
      reviewThreads { totalCount }
      createdAt
      mergedAt
      closedAt
      state
      isDraft
      reviews(first: 100) {
        nodes {
          submittedAt
          state
          author { login }
        }
      }
    }`
    )
    .join('\n    ');

  return `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        ${prQueries}
      }
    }
  `;
}

/**
 * Parses the GraphQL response into a list of full PR data results.
 *
 * @param response - GraphQL API response
 * @param prNumbers - Original PR numbers requested (for handling null responses)
 * @returns Array of PRFullDataResult
 */
export function parsePRFullDataResponse(
  response: PRFullDataQueryResponse,
  prNumbers: number[]
): PRFullDataResult[] {
  const results: PRFullDataResult[] = [];

  for (let i = 0; i < prNumbers.length; i++) {
    const prData = response.repository[`pr${i}`];

    if (!prData) {
      // PR not found or inaccessible - skip
      continue;
    }

    const reviews = prData.reviews?.nodes || [];

    results.push({
      number: prData.number,
      additions: prData.additions,
      deletions: prData.deletions,
      changedFiles: prData.changedFiles,
      comments: prData.comments?.totalCount || 0,
      reviewThreads: prData.reviewThreads?.totalCount || 0,
      createdAt: prData.createdAt,
      mergedAt: prData.mergedAt,
      closedAt: prData.closedAt,
      state: prData.state,
      isDraft: prData.isDraft,
      reviews: reviews.map((r) => ({
        submittedAt: r.submittedAt,
        state: r.state,
        author: r.author,
      })),
    });
  }

  return results;
}

/**
 * Check if an error is a retryable server error (502, 503, etc.)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check for 502/503 status codes or nginx errors
    if (
      message.includes('502') ||
      message.includes('503') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable')
    ) {
      return true;
    }
    // Check for status property on HttpError
    const httpError = error as { status?: number };
    if (httpError.status === 502 || httpError.status === 503) {
      return true;
    }
  }
  return false;
}

/**
 * Fetches full PR data (details + reviews) for multiple PRs in a single GraphQL request.
 *
 * @param token - GitHub authentication token
 * @param owner - Repository owner (org or user)
 * @param repo - Repository name
 * @param prNumbers - Array of PR numbers to fetch (max GRAPHQL_FULL_DATA_BATCH_SIZE)
 * @param logger - Optional logger for debugging
 * @returns Array of PRFullDataResult
 */
export async function fetchPRFullDataBatch(
  token: string,
  owner: string,
  repo: string,
  prNumbers: number[],
  logger?: Logger
): Promise<PRFullDataResult[]> {
  if (prNumbers.length === 0) {
    return [];
  }

  if (prNumbers.length > GRAPHQL_BATCH_SIZE) {
    throw new Error(
      `Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs. Got ${prNumbers.length}. ` +
        `Split into smaller batches before calling this function.`
    );
  }

  const query = buildPRFullDataQuery(prNumbers);

  try {
    const graphqlWithAuth = octokitGraphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });

    const response = (await graphqlWithAuth(query, {
      owner,
      repo,
    })) as PRFullDataQueryResponse;

    const results = parsePRFullDataResponse(response, prNumbers);

    logger?.debug(
      {
        owner,
        repo,
        prCount: prNumbers.length,
        resultCount: results.length,
      },
      `Fetched full data for ${prNumbers.length} PRs in single GraphQL request`
    );

    return results;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('rate limit exceeded')) {
      logger?.error({ owner, repo, error: error.message }, 'GraphQL rate limit exceeded');
      throw new Error(`GraphQL rate limit exceeded while fetching PR data for ${owner}/${repo}`);
    }

    logger?.error(
      { owner, repo, error: error instanceof Error ? error.message : error },
      'GraphQL error fetching PR full data'
    );
    throw error;
  }
}

/**
 * Fetches full PR data for a large number of PRs by splitting into batches.
 * Uses adaptive batch sizing - starts with GRAPHQL_FULL_DATA_BATCH_SIZE and
 * falls back to smaller batches on 502/503 errors.
 *
 * @param token - GitHub authentication token
 * @param owner - Repository owner (org or user)
 * @param repo - Repository name
 * @param prNumbers - Array of PR numbers to fetch (any size)
 * @param logger - Optional logger for debugging
 * @returns Map of PR number to full PR data
 */
export async function fetchAllPRFullDataBatched(
  token: string,
  owner: string,
  repo: string,
  prNumbers: number[],
  logger?: Logger
): Promise<Map<number, PRFullDataResult>> {
  const allData = new Map<number, PRFullDataResult>();

  if (prNumbers.length === 0) {
    return allData;
  }

  // Start with the standard batch size for full data queries
  let currentBatchSize = GRAPHQL_FULL_DATA_BATCH_SIZE;
  const totalBatches = Math.ceil(prNumbers.length / currentBatchSize);

  logger?.info(
    { owner, repo, totalPRs: prNumbers.length, totalBatches, batchSize: currentBatchSize },
    `Fetching full data for ${prNumbers.length} PRs using batched GraphQL...`
  );

  let i = 0;
  let retryCount = 0;
  while (i < prNumbers.length) {
    const batch = prNumbers.slice(i, i + currentBatchSize);
    const batchNumber = Math.floor(i / GRAPHQL_FULL_DATA_BATCH_SIZE) + 1;

    logger?.debug(
      { owner, repo, batch: batchNumber, batchSize: batch.length },
      `Fetching PR full data batch ${batchNumber} (${batch.length} PRs)`
    );

    try {
      const results = await fetchPRFullDataBatch(token, owner, repo, batch, logger);

      for (const result of results) {
        allData.set(result.number, result);
      }

      // Move to next batch and reset retry count
      i += currentBatchSize;
      retryCount = 0;

      // Add a small delay between batches to be conservative
      if (i < prNumbers.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      if (isRetryableError(error)) {
        if (currentBatchSize > GRAPHQL_RETRY_BATCH_SIZE) {
          // Reduce batch size and retry the same batch
          const oldBatchSize = currentBatchSize;
          currentBatchSize = Math.max(GRAPHQL_RETRY_BATCH_SIZE, Math.floor(currentBatchSize / 2));
          retryCount = 0; // Reset retry count when reducing batch size

          logger?.warn(
            { owner, repo, oldBatchSize, newBatchSize: currentBatchSize, prIndex: i },
            `Got 502/503 error, reducing batch size from ${oldBatchSize} to ${currentBatchSize} and retrying`
          );

          // Add a delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        } else if (retryCount < GRAPHQL_MAX_RETRIES) {
          // At minimum batch size, retry with exponential backoff
          retryCount++;
          const delay = GRAPHQL_RETRY_BASE_DELAY * 2 ** (retryCount - 1);

          logger?.warn(
            {
              owner,
              repo,
              retryCount,
              maxRetries: GRAPHQL_MAX_RETRIES,
              delayMs: delay,
              prIndex: i,
            },
            `Got 502/503 error at minimum batch size, retry ${retryCount}/${GRAPHQL_MAX_RETRIES} after ${delay}ms`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Exhausted all retries
        logger?.error(
          { owner, repo, retryCount, prIndex: i, batchSize: currentBatchSize },
          `Failed after ${retryCount} retries at minimum batch size`
        );
      }

      // Not a retryable error or exhausted retries, rethrow
      throw error;
    }
  }

  logger?.info(
    {
      owner,
      repo,
      totalPRs: prNumbers.length,
      fetchedPRs: allData.size,
      finalBatchSize: currentBatchSize,
    },
    `Completed fetching full data for ${allData.size} PRs`
  );

  return allData;
}

// ============================================================================
// PR Commits Query Functions
// ============================================================================

/**
 * GraphQL response structure for PR commits query
 */
interface PRCommitsQueryResponse {
  repository: {
    [key: string]: {
      number: number;
      commits: {
        nodes: Array<{
          commit: {
            committedDate: string;
            additions: number;
            deletions: number;
            author?: {
              name: string | null;
            } | null;
          };
        }>;
      };
    } | null;
  };
}

/**
 * Builds a GraphQL query for fetching commits for multiple PRs.
 * Uses a smaller batch size (25) due to the complexity of nested commit data.
 *
 * @param prNumbers - Array of PR numbers to query (max 25)
 * @returns GraphQL query string
 */
export function buildPRCommitsQuery(prNumbers: number[]): string {
  if (prNumbers.length === 0) {
    throw new Error('Cannot build query for empty PR list');
  }

  if (prNumbers.length > GRAPHQL_COMMITS_BATCH_SIZE) {
    throw new Error(
      `Batch size exceeds maximum of ${GRAPHQL_COMMITS_BATCH_SIZE} PRs for commits query. Got ${prNumbers.length}.`
    );
  }

  const prQueries = prNumbers
    .map(
      (num, i) =>
        `pr${i}: pullRequest(number: ${num}) {
      number
      commits(first: 250) {
        nodes {
          commit {
            committedDate
            additions
            deletions
            author { name }
          }
        }
      }
    }`
    )
    .join('\n    ');

  return `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        ${prQueries}
      }
    }
  `;
}

/**
 * Parses the GraphQL response into a list of PR commits results.
 *
 * @param response - GraphQL API response
 * @param prNumbers - Original PR numbers requested (for handling null responses)
 * @returns Array of PRCommitsResult
 */
export function parsePRCommitsResponse(
  response: PRCommitsQueryResponse,
  prNumbers: number[]
): PRCommitsResult[] {
  const results: PRCommitsResult[] = [];

  for (let i = 0; i < prNumbers.length; i++) {
    const prData = response.repository[`pr${i}`];

    if (!prData) {
      // PR not found or inaccessible - skip
      continue;
    }

    const commitNodes = prData.commits?.nodes || [];

    results.push({
      number: prData.number,
      commits: commitNodes.map((node) => ({
        committedDate: node.commit.committedDate,
        additions: node.commit.additions,
        deletions: node.commit.deletions,
        author: node.commit.author,
      })),
    });
  }

  return results;
}

/**
 * Fetches commits for multiple PRs in a single GraphQL request.
 *
 * @param token - GitHub authentication token
 * @param owner - Repository owner (org or user)
 * @param repo - Repository name
 * @param prNumbers - Array of PR numbers to fetch commits for (max 25)
 * @param logger - Optional logger for debugging
 * @returns Array of PRCommitsResult
 */
export async function fetchPRCommitsBatch(
  token: string,
  owner: string,
  repo: string,
  prNumbers: number[],
  logger?: Logger
): Promise<PRCommitsResult[]> {
  if (prNumbers.length === 0) {
    return [];
  }

  if (prNumbers.length > GRAPHQL_COMMITS_BATCH_SIZE) {
    throw new Error(
      `Batch size exceeds maximum of ${GRAPHQL_COMMITS_BATCH_SIZE} PRs for commits query. Got ${prNumbers.length}. ` +
        `Split into smaller batches before calling this function.`
    );
  }

  const query = buildPRCommitsQuery(prNumbers);

  try {
    const graphqlWithAuth = octokitGraphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });

    const response = (await graphqlWithAuth(query, {
      owner,
      repo,
    })) as PRCommitsQueryResponse;

    const results = parsePRCommitsResponse(response, prNumbers);

    logger?.debug(
      {
        owner,
        repo,
        prCount: prNumbers.length,
        resultCount: results.length,
        totalCommits: results.reduce((sum, r) => sum + r.commits.length, 0),
      },
      `Fetched commits for ${prNumbers.length} PRs in single GraphQL request`
    );

    return results;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('rate limit exceeded')) {
      logger?.error({ owner, repo, error: error.message }, 'GraphQL rate limit exceeded');
      throw new Error(`GraphQL rate limit exceeded while fetching PR commits for ${owner}/${repo}`);
    }

    logger?.error(
      { owner, repo, error: error instanceof Error ? error.message : error },
      'GraphQL error fetching PR commits'
    );
    throw error;
  }
}

/**
 * Fetches commits for a large number of PRs by splitting into batches.
 * Uses adaptive batch sizing - starts with GRAPHQL_COMMITS_BATCH_SIZE and
 * falls back to smaller batches on 502/503 errors.
 *
 * @param token - GitHub authentication token
 * @param owner - Repository owner (org or user)
 * @param repo - Repository name
 * @param prNumbers - Array of PR numbers to fetch commits for (any size)
 * @param logger - Optional logger for debugging
 * @returns Map of PR number to commits data
 */
export async function fetchAllPRCommitsBatched(
  token: string,
  owner: string,
  repo: string,
  prNumbers: number[],
  logger?: Logger
): Promise<Map<number, PRCommitsResult>> {
  const allData = new Map<number, PRCommitsResult>();

  if (prNumbers.length === 0) {
    return allData;
  }

  // Start with the standard batch size for commits queries
  let currentBatchSize = GRAPHQL_COMMITS_BATCH_SIZE;
  const totalBatches = Math.ceil(prNumbers.length / currentBatchSize);

  logger?.info(
    { owner, repo, totalPRs: prNumbers.length, totalBatches, batchSize: currentBatchSize },
    `Fetching commits for ${prNumbers.length} PRs using batched GraphQL...`
  );

  let i = 0;
  let retryCount = 0;
  while (i < prNumbers.length) {
    const batch = prNumbers.slice(i, i + currentBatchSize);
    const batchNumber = Math.floor(i / GRAPHQL_COMMITS_BATCH_SIZE) + 1;

    logger?.debug(
      { owner, repo, batch: batchNumber, batchSize: batch.length },
      `Fetching PR commits batch ${batchNumber} (${batch.length} PRs)`
    );

    try {
      const results = await fetchPRCommitsBatch(token, owner, repo, batch, logger);

      for (const result of results) {
        allData.set(result.number, result);
      }

      // Move to next batch and reset retry count
      i += currentBatchSize;
      retryCount = 0;

      // Add a small delay between batches to be conservative
      if (i < prNumbers.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      if (isRetryableError(error)) {
        if (currentBatchSize > GRAPHQL_RETRY_BATCH_SIZE) {
          // Reduce batch size and retry the same batch
          const oldBatchSize = currentBatchSize;
          currentBatchSize = Math.max(GRAPHQL_RETRY_BATCH_SIZE, Math.floor(currentBatchSize / 2));
          retryCount = 0; // Reset retry count when reducing batch size

          logger?.warn(
            { owner, repo, oldBatchSize, newBatchSize: currentBatchSize, prIndex: i },
            `Got 502/503 error fetching commits, reducing batch size from ${oldBatchSize} to ${currentBatchSize} and retrying`
          );

          // Add a delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        } else if (retryCount < GRAPHQL_MAX_RETRIES) {
          // At minimum batch size, retry with exponential backoff
          retryCount++;
          const delay = GRAPHQL_RETRY_BASE_DELAY * 2 ** (retryCount - 1);

          logger?.warn(
            {
              owner,
              repo,
              retryCount,
              maxRetries: GRAPHQL_MAX_RETRIES,
              delayMs: delay,
              prIndex: i,
            },
            `Got 502/503 error fetching commits at minimum batch size, retry ${retryCount}/${GRAPHQL_MAX_RETRIES} after ${delay}ms`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Exhausted all retries
        logger?.error(
          { owner, repo, retryCount, prIndex: i, batchSize: currentBatchSize },
          `Failed fetching commits after ${retryCount} retries at minimum batch size`
        );
      }

      // Not a retryable error or exhausted retries, rethrow
      throw error;
    }
  }

  logger?.info(
    {
      owner,
      repo,
      totalPRs: prNumbers.length,
      fetchedPRs: allData.size,
      finalBatchSize: currentBatchSize,
      totalCommits: Array.from(allData.values()).reduce((sum, r) => sum + r.commits.length, 0),
    },
    `Completed fetching commits for ${allData.size} PRs using ${totalBatches} GraphQL request(s)`
  );

  return allData;
}
