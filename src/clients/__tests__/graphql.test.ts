import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  buildPRCommitsQuery,
  buildPRFullDataQuery,
  buildPRReviewQuery,
  fetchAllPRCommitsBatched,
  fetchAllPRFullDataBatched,
  fetchAllPRReviewsBatched,
  fetchPRCommitsBatch,
  fetchPRFullDataBatch,
  fetchPRReviewsBatch,
  GRAPHQL_BATCH_SIZE,
  GRAPHQL_COMMITS_BATCH_SIZE,
  GRAPHQL_FULL_DATA_BATCH_SIZE,
  GRAPHQL_RETRY_BATCH_SIZE,
  parsePRCommitsResponse,
  parsePRFullDataResponse,
  parseReviewResponse,
} from '../github/graphql';

// Mock @octokit/graphql
jest.mock('@octokit/graphql', () => ({
  graphql: {
    defaults: jest.fn(() => jest.fn()),
  },
}));

// Get the mocked module
const { graphql } = jest.requireMock('@octokit/graphql') as {
  graphql: { defaults: jest.Mock<() => jest.Mock> };
};

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger),
} as any;

describe('GraphQL Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GRAPHQL_BATCH_SIZE', () => {
    it('should be 50', () => {
      expect(GRAPHQL_BATCH_SIZE).toBe(50);
    });
  });

  describe('buildPRReviewQuery', () => {
    it('should build valid GraphQL query for single PR', () => {
      const query = buildPRReviewQuery([1]);

      expect(query).toContain('query($owner: String!, $repo: String!)');
      expect(query).toContain('repository(owner: $owner, name: $repo)');
      expect(query).toContain('pr0: pullRequest(number: 1)');
      expect(query).toContain('reviews(first: 1');
      expect(query).toContain('states: [APPROVED, CHANGES_REQUESTED, COMMENTED]');
      expect(query).toContain('submittedAt');
    });

    it('should build valid GraphQL query for multiple PRs', () => {
      const query = buildPRReviewQuery([1, 2, 3]);

      expect(query).toContain('pr0: pullRequest(number: 1)');
      expect(query).toContain('pr1: pullRequest(number: 2)');
      expect(query).toContain('pr2: pullRequest(number: 3)');
    });

    it('should throw error for empty PR list', () => {
      expect(() => buildPRReviewQuery([])).toThrow('Cannot build query for empty PR list');
    });

    it('should throw error when batch size exceeds maximum', () => {
      const tooManyPRs = Array.from({ length: 51 }, (_, i) => i + 1);

      expect(() => buildPRReviewQuery(tooManyPRs)).toThrow(
        `Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs`
      );
    });

    it('should handle PR numbers with various values', () => {
      const query = buildPRReviewQuery([100, 999, 12345]);

      expect(query).toContain('pr0: pullRequest(number: 100)');
      expect(query).toContain('pr1: pullRequest(number: 999)');
      expect(query).toContain('pr2: pullRequest(number: 12345)');
    });
  });

  describe('parseReviewResponse', () => {
    it('should parse response with reviews correctly', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            reviews: {
              nodes: [{ submittedAt: '2024-01-15T10:00:00Z' }],
            },
          },
        },
      };

      const results = parseReviewResponse(response, [1]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        prNumber: 1,
        hasReviews: true,
        firstReviewSubmittedAt: '2024-01-15T10:00:00Z',
      });
    });

    it('should parse response without reviews correctly', () => {
      const response = {
        repository: {
          pr0: {
            number: 2,
            reviews: {
              nodes: [],
            },
          },
        },
      };

      const results = parseReviewResponse(response, [2]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        prNumber: 2,
        hasReviews: false,
        firstReviewSubmittedAt: undefined,
      });
    });

    it('should handle null PR data (PR not found)', () => {
      const response = {
        repository: {
          pr0: null,
        },
      };

      const results = parseReviewResponse(response as any, [999]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        prNumber: 999,
        hasReviews: false,
      });
    });

    it('should handle multiple PRs with mixed review status', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            reviews: { nodes: [{ submittedAt: '2024-01-15T10:00:00Z' }] },
          },
          pr1: {
            number: 2,
            reviews: { nodes: [] },
          },
          pr2: {
            number: 3,
            reviews: { nodes: [{ submittedAt: '2024-01-14T10:00:00Z' }] },
          },
        },
      };

      const results = parseReviewResponse(response, [1, 2, 3]);

      expect(results).toHaveLength(3);
      expect(results[0].hasReviews).toBe(true);
      expect(results[1].hasReviews).toBe(false);
      expect(results[2].hasReviews).toBe(true);
    });

    it('should extract first review timestamp correctly', () => {
      const timestamp = '2024-01-20T15:30:00Z';
      const response = {
        repository: {
          pr0: {
            number: 1,
            reviews: {
              nodes: [{ submittedAt: timestamp }],
            },
          },
        },
      };

      const results = parseReviewResponse(response, [1]);

      expect(results[0].firstReviewSubmittedAt).toBe(timestamp);
    });

    it('should handle missing reviews field gracefully', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            reviews: undefined as any,
          },
        },
      };

      const results = parseReviewResponse(response, [1]);

      expect(results[0].hasReviews).toBe(false);
    });
  });

  describe('fetchPRReviewsBatch', () => {
    let mockGraphqlFn: jest.Mock<any>;

    beforeEach(() => {
      mockGraphqlFn = jest.fn<any>();
      graphql.defaults.mockReturnValue(mockGraphqlFn);
    });

    it('should return empty array for empty PR list', async () => {
      const results = await fetchPRReviewsBatch('test-token', 'owner', 'repo', [], mockLogger);

      expect(results).toEqual([]);
      expect(mockGraphqlFn).not.toHaveBeenCalled();
    });

    it('should throw error when batch size exceeds maximum', async () => {
      const tooManyPRs = Array.from({ length: 51 }, (_, i) => i + 1);

      await expect(
        fetchPRReviewsBatch('test-token', 'owner', 'repo', tooManyPRs, mockLogger)
      ).rejects.toThrow(`Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs`);
    });

    it('should fetch reviews for multiple PRs in single request', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: { number: 1, reviews: { nodes: [{ submittedAt: '2024-01-15T10:00:00Z' }] } },
          pr1: { number: 2, reviews: { nodes: [] } },
        },
      });

      const results = await fetchPRReviewsBatch('test-token', 'owner', 'repo', [1, 2], mockLogger);

      expect(results).toHaveLength(2);
      expect(results[0].hasReviews).toBe(true);
      expect(results[1].hasReviews).toBe(false);
    });

    it('should handle GraphQL API errors gracefully', async () => {
      mockGraphqlFn.mockRejectedValue(new Error('GraphQL error'));

      await expect(
        fetchPRReviewsBatch('test-token', 'owner', 'repo', [1], mockLogger)
      ).rejects.toThrow('GraphQL error');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle rate limit errors with appropriate message', async () => {
      mockGraphqlFn.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        fetchPRReviewsBatch('test-token', 'owner', 'repo', [1], mockLogger)
      ).rejects.toThrow('GraphQL rate limit exceeded while fetching PR reviews');
    });

    it('should log debug information on success', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: { number: 1, reviews: { nodes: [{ submittedAt: '2024-01-15T10:00:00Z' }] } },
        },
      });

      await fetchPRReviewsBatch('test-token', 'owner', 'repo', [1], mockLogger);

      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('fetchAllPRReviewsBatched', () => {
    let mockGraphqlFn: jest.Mock<any>;

    beforeEach(() => {
      mockGraphqlFn = jest.fn<any>();
      graphql.defaults.mockReturnValue(mockGraphqlFn);
    });

    it('should return empty map for empty PR list', async () => {
      const results = await fetchAllPRReviewsBatched('test-token', 'owner', 'repo', [], mockLogger);

      expect(results.size).toBe(0);
    });

    it('should process PRs within single batch', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: { number: 1, reviews: { nodes: [{ submittedAt: '2024-01-15T10:00:00Z' }] } },
          pr1: { number: 2, reviews: { nodes: [] } },
        },
      });

      const results = await fetchAllPRReviewsBatched(
        'test-token',
        'owner',
        'repo',
        [1, 2],
        mockLogger
      );

      expect(results.size).toBe(2);
      expect(results.get(1)).toEqual({
        hasReviews: true,
        firstReviewAt: '2024-01-15T10:00:00Z',
      });
      expect(results.get(2)).toEqual({
        hasReviews: false,
        firstReviewAt: undefined,
      });
    });

    it('should split large PR lists into multiple batches', async () => {
      // Create 75 PRs which should require 2 batches (50 + 25)
      const prNumbers = Array.from({ length: 75 }, (_, i) => i + 1);

      // First batch response
      const batch1Response: any = { repository: {} };
      for (let i = 0; i < 50; i++) {
        batch1Response.repository[`pr${i}`] = {
          number: i + 1,
          reviews: { nodes: [] },
        };
      }

      // Second batch response
      const batch2Response: any = { repository: {} };
      for (let i = 0; i < 25; i++) {
        batch2Response.repository[`pr${i}`] = {
          number: i + 51,
          reviews: { nodes: [] },
        };
      }

      mockGraphqlFn.mockResolvedValueOnce(batch1Response).mockResolvedValueOnce(batch2Response);

      const results = await fetchAllPRReviewsBatched(
        'test-token',
        'owner',
        'repo',
        prNumbers,
        mockLogger
      );

      expect(mockGraphqlFn).toHaveBeenCalledTimes(2);
      expect(results.size).toBe(75);
    });

    it('should return Map with correct structure', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: { number: 1, reviews: { nodes: [{ submittedAt: '2024-01-15T10:00:00Z' }] } },
        },
      });

      const results = await fetchAllPRReviewsBatched(
        'test-token',
        'owner',
        'repo',
        [1],
        mockLogger
      );

      expect(results).toBeInstanceOf(Map);
      const entry = results.get(1);
      expect(entry).toHaveProperty('hasReviews');
      expect(entry).toHaveProperty('firstReviewAt');
    });

    it('should log summary information', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: { number: 1, reviews: { nodes: [] } },
        },
      });

      await fetchAllPRReviewsBatched('test-token', 'owner', 'repo', [1], mockLogger);

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PR Full Data Query Tests
  // ============================================================================

  describe('GRAPHQL_FULL_DATA_BATCH_SIZE', () => {
    it('should be 20', () => {
      expect(GRAPHQL_FULL_DATA_BATCH_SIZE).toBe(20);
    });
  });

  describe('GRAPHQL_COMMITS_BATCH_SIZE', () => {
    it('should be 25', () => {
      expect(GRAPHQL_COMMITS_BATCH_SIZE).toBe(25);
    });
  });

  describe('GRAPHQL_RETRY_BATCH_SIZE', () => {
    it('should be 5', () => {
      expect(GRAPHQL_RETRY_BATCH_SIZE).toBe(5);
    });
  });

  describe('buildPRFullDataQuery', () => {
    it('should build valid GraphQL query for single PR', () => {
      const query = buildPRFullDataQuery([1]);

      expect(query).toContain('query($owner: String!, $repo: String!)');
      expect(query).toContain('repository(owner: $owner, name: $repo)');
      expect(query).toContain('pr0: pullRequest(number: 1)');
      expect(query).toContain('additions');
      expect(query).toContain('deletions');
      expect(query).toContain('changedFiles');
      expect(query).toContain('comments { totalCount }');
      expect(query).toContain('reviewThreads { totalCount }');
      expect(query).toContain('createdAt');
      expect(query).toContain('mergedAt');
      expect(query).toContain('closedAt');
      expect(query).toContain('state');
      expect(query).toContain('isDraft');
      expect(query).toContain('reviews(first: 100)');
    });

    it('should build valid GraphQL query for multiple PRs', () => {
      const query = buildPRFullDataQuery([1, 2, 3]);

      expect(query).toContain('pr0: pullRequest(number: 1)');
      expect(query).toContain('pr1: pullRequest(number: 2)');
      expect(query).toContain('pr2: pullRequest(number: 3)');
    });

    it('should throw error for empty PR list', () => {
      expect(() => buildPRFullDataQuery([])).toThrow('Cannot build query for empty PR list');
    });

    it('should throw error when batch size exceeds maximum', () => {
      const tooManyPRs = Array.from({ length: 51 }, (_, i) => i + 1);

      expect(() => buildPRFullDataQuery(tooManyPRs)).toThrow(
        `Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs`
      );
    });
  });

  describe('parsePRFullDataResponse', () => {
    it('should parse response with full PR data correctly', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            additions: 100,
            deletions: 50,
            changedFiles: 5,
            comments: { totalCount: 3 },
            reviewThreads: { totalCount: 2 },
            createdAt: '2024-01-10T10:00:00Z',
            mergedAt: '2024-01-15T10:00:00Z',
            closedAt: '2024-01-15T10:00:00Z',
            state: 'MERGED',
            isDraft: false,
            reviews: {
              nodes: [
                {
                  submittedAt: '2024-01-12T10:00:00Z',
                  state: 'APPROVED',
                  author: { login: 'reviewer1' },
                },
              ],
            },
          },
        },
      };

      const results = parsePRFullDataResponse(response, [1]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        number: 1,
        additions: 100,
        deletions: 50,
        changedFiles: 5,
        comments: 3,
        reviewThreads: 2,
        createdAt: '2024-01-10T10:00:00Z',
        mergedAt: '2024-01-15T10:00:00Z',
        closedAt: '2024-01-15T10:00:00Z',
        state: 'MERGED',
        isDraft: false,
        reviews: [
          {
            submittedAt: '2024-01-12T10:00:00Z',
            state: 'APPROVED',
            author: { login: 'reviewer1' },
          },
        ],
      });
    });

    it('should handle null PR data (PR not found)', () => {
      const response = {
        repository: {
          pr0: null,
        },
      };

      const results = parsePRFullDataResponse(response as any, [999]);

      expect(results).toHaveLength(0);
    });

    it('should handle multiple PRs with mixed status', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            additions: 10,
            deletions: 5,
            changedFiles: 1,
            comments: { totalCount: 0 },
            reviewThreads: { totalCount: 0 },
            createdAt: '2024-01-10T10:00:00Z',
            mergedAt: '2024-01-12T10:00:00Z',
            closedAt: '2024-01-12T10:00:00Z',
            state: 'MERGED',
            isDraft: false,
            reviews: { nodes: [] },
          },
          pr1: null,
          pr2: {
            number: 3,
            additions: 20,
            deletions: 10,
            changedFiles: 2,
            comments: { totalCount: 1 },
            reviewThreads: { totalCount: 1 },
            createdAt: '2024-01-11T10:00:00Z',
            mergedAt: null,
            closedAt: null,
            state: 'OPEN',
            isDraft: true,
            reviews: { nodes: [] },
          },
        },
      };

      const results = parsePRFullDataResponse(response as any, [1, 2, 3]);

      expect(results).toHaveLength(2);
      expect(results[0].number).toBe(1);
      expect(results[1].number).toBe(3);
    });
  });

  describe('fetchPRFullDataBatch', () => {
    let mockGraphqlFn: jest.Mock<any>;

    beforeEach(() => {
      mockGraphqlFn = jest.fn<any>();
      graphql.defaults.mockReturnValue(mockGraphqlFn);
    });

    it('should return empty array for empty PR list', async () => {
      const results = await fetchPRFullDataBatch('test-token', 'owner', 'repo', [], mockLogger);

      expect(results).toEqual([]);
      expect(mockGraphqlFn).not.toHaveBeenCalled();
    });

    it('should throw error when batch size exceeds maximum', async () => {
      const tooManyPRs = Array.from({ length: 51 }, (_, i) => i + 1);

      await expect(
        fetchPRFullDataBatch('test-token', 'owner', 'repo', tooManyPRs, mockLogger)
      ).rejects.toThrow(`Batch size exceeds maximum of ${GRAPHQL_BATCH_SIZE} PRs`);
    });

    it('should fetch full data for multiple PRs in single request', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: {
            number: 1,
            additions: 10,
            deletions: 5,
            changedFiles: 1,
            comments: { totalCount: 2 },
            reviewThreads: { totalCount: 1 },
            createdAt: '2024-01-10T10:00:00Z',
            mergedAt: '2024-01-12T10:00:00Z',
            closedAt: '2024-01-12T10:00:00Z',
            state: 'MERGED',
            isDraft: false,
            reviews: { nodes: [] },
          },
          pr1: {
            number: 2,
            additions: 20,
            deletions: 10,
            changedFiles: 2,
            comments: { totalCount: 0 },
            reviewThreads: { totalCount: 0 },
            createdAt: '2024-01-11T10:00:00Z',
            mergedAt: null,
            closedAt: null,
            state: 'OPEN',
            isDraft: true,
            reviews: { nodes: [] },
          },
        },
      });

      const results = await fetchPRFullDataBatch('test-token', 'owner', 'repo', [1, 2], mockLogger);

      expect(results).toHaveLength(2);
      expect(results[0].additions).toBe(10);
      expect(results[1].isDraft).toBe(true);
    });
  });

  describe('fetchAllPRFullDataBatched', () => {
    let mockGraphqlFn: jest.Mock<any>;

    beforeEach(() => {
      mockGraphqlFn = jest.fn<any>();
      graphql.defaults.mockReturnValue(mockGraphqlFn);
    });

    it('should return empty map for empty PR list', async () => {
      const results = await fetchAllPRFullDataBatched(
        'test-token',
        'owner',
        'repo',
        [],
        mockLogger
      );

      expect(results.size).toBe(0);
    });

    it('should return Map with correct structure', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: {
            number: 1,
            additions: 10,
            deletions: 5,
            changedFiles: 1,
            comments: { totalCount: 0 },
            reviewThreads: { totalCount: 0 },
            createdAt: '2024-01-10T10:00:00Z',
            mergedAt: null,
            closedAt: null,
            state: 'OPEN',
            isDraft: false,
            reviews: { nodes: [] },
          },
        },
      });

      const results = await fetchAllPRFullDataBatched(
        'test-token',
        'owner',
        'repo',
        [1],
        mockLogger
      );

      expect(results).toBeInstanceOf(Map);
      const entry = results.get(1);
      expect(entry).toHaveProperty('additions');
      expect(entry).toHaveProperty('deletions');
      expect(entry).toHaveProperty('reviews');
    });

    it('should split large PR lists into multiple batches', async () => {
      const prNumbers = Array.from({ length: 75 }, (_, i) => i + 1);

      // Helper to create batch response
      const createBatchResponse = (startPr: number, count: number) => {
        const response: any = { repository: {} };
        for (let i = 0; i < count; i++) {
          response.repository[`pr${i}`] = {
            number: startPr + i,
            additions: 1,
            deletions: 1,
            changedFiles: 1,
            comments: { totalCount: 0 },
            reviewThreads: { totalCount: 0 },
            createdAt: '2024-01-10T10:00:00Z',
            mergedAt: null,
            closedAt: null,
            state: 'OPEN',
            isDraft: false,
            reviews: { nodes: [] },
          };
        }
        return response;
      };

      // With GRAPHQL_FULL_DATA_BATCH_SIZE = 20, 75 PRs = 4 batches (20+20+20+15)
      const batch1Response = createBatchResponse(1, 20);
      const batch2Response = createBatchResponse(21, 20);
      const batch3Response = createBatchResponse(41, 20);
      const batch4Response = createBatchResponse(61, 15);

      mockGraphqlFn
        .mockResolvedValueOnce(batch1Response)
        .mockResolvedValueOnce(batch2Response)
        .mockResolvedValueOnce(batch3Response)
        .mockResolvedValueOnce(batch4Response);

      const results = await fetchAllPRFullDataBatched(
        'test-token',
        'owner',
        'repo',
        prNumbers,
        mockLogger
      );

      expect(mockGraphqlFn).toHaveBeenCalledTimes(4);
      expect(results.size).toBe(75);
    });
  });

  // ============================================================================
  // PR Commits Query Tests
  // ============================================================================

  describe('buildPRCommitsQuery', () => {
    it('should build valid GraphQL query for single PR', () => {
      const query = buildPRCommitsQuery([1]);

      expect(query).toContain('query($owner: String!, $repo: String!)');
      expect(query).toContain('repository(owner: $owner, name: $repo)');
      expect(query).toContain('pr0: pullRequest(number: 1)');
      expect(query).toContain('commits(first: 250)');
      expect(query).toContain('committedDate');
      expect(query).toContain('additions');
      expect(query).toContain('deletions');
      expect(query).toContain('author { name }');
    });

    it('should build valid GraphQL query for multiple PRs', () => {
      const query = buildPRCommitsQuery([1, 2, 3]);

      expect(query).toContain('pr0: pullRequest(number: 1)');
      expect(query).toContain('pr1: pullRequest(number: 2)');
      expect(query).toContain('pr2: pullRequest(number: 3)');
    });

    it('should throw error for empty PR list', () => {
      expect(() => buildPRCommitsQuery([])).toThrow('Cannot build query for empty PR list');
    });

    it('should throw error when batch size exceeds maximum for commits', () => {
      const tooManyPRs = Array.from({ length: 26 }, (_, i) => i + 1);

      expect(() => buildPRCommitsQuery(tooManyPRs)).toThrow(
        `Batch size exceeds maximum of ${GRAPHQL_COMMITS_BATCH_SIZE} PRs for commits query`
      );
    });
  });

  describe('parsePRCommitsResponse', () => {
    it('should parse response with commits correctly', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            commits: {
              nodes: [
                {
                  commit: {
                    committedDate: '2024-01-10T10:00:00Z',
                    additions: 50,
                    deletions: 20,
                    author: { name: 'Author Name' },
                  },
                },
                {
                  commit: {
                    committedDate: '2024-01-11T10:00:00Z',
                    additions: 30,
                    deletions: 10,
                    author: { name: 'Author Name' },
                  },
                },
              ],
            },
          },
        },
      };

      const results = parsePRCommitsResponse(response, [1]);

      expect(results).toHaveLength(1);
      expect(results[0].number).toBe(1);
      expect(results[0].commits).toHaveLength(2);
      expect(results[0].commits[0].additions).toBe(50);
      expect(results[0].commits[1].additions).toBe(30);
    });

    it('should handle null PR data (PR not found)', () => {
      const response = {
        repository: {
          pr0: null,
        },
      };

      const results = parsePRCommitsResponse(response as any, [999]);

      expect(results).toHaveLength(0);
    });

    it('should handle PR with no commits', () => {
      const response = {
        repository: {
          pr0: {
            number: 1,
            commits: { nodes: [] },
          },
        },
      };

      const results = parsePRCommitsResponse(response, [1]);

      expect(results).toHaveLength(1);
      expect(results[0].commits).toHaveLength(0);
    });
  });

  describe('fetchPRCommitsBatch', () => {
    let mockGraphqlFn: jest.Mock<any>;

    beforeEach(() => {
      mockGraphqlFn = jest.fn<any>();
      graphql.defaults.mockReturnValue(mockGraphqlFn);
    });

    it('should return empty array for empty PR list', async () => {
      const results = await fetchPRCommitsBatch('test-token', 'owner', 'repo', [], mockLogger);

      expect(results).toEqual([]);
      expect(mockGraphqlFn).not.toHaveBeenCalled();
    });

    it('should throw error when batch size exceeds maximum for commits', async () => {
      const tooManyPRs = Array.from({ length: 26 }, (_, i) => i + 1);

      await expect(
        fetchPRCommitsBatch('test-token', 'owner', 'repo', tooManyPRs, mockLogger)
      ).rejects.toThrow(`Batch size exceeds maximum of ${GRAPHQL_COMMITS_BATCH_SIZE} PRs`);
    });

    it('should fetch commits for multiple PRs in single request', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: {
            number: 1,
            commits: {
              nodes: [
                {
                  commit: {
                    committedDate: '2024-01-10T10:00:00Z',
                    additions: 10,
                    deletions: 5,
                    author: { name: 'Author' },
                  },
                },
              ],
            },
          },
          pr1: {
            number: 2,
            commits: {
              nodes: [
                {
                  commit: {
                    committedDate: '2024-01-11T10:00:00Z',
                    additions: 20,
                    deletions: 10,
                    author: { name: 'Author' },
                  },
                },
              ],
            },
          },
        },
      });

      const results = await fetchPRCommitsBatch('test-token', 'owner', 'repo', [1, 2], mockLogger);

      expect(results).toHaveLength(2);
      expect(results[0].commits[0].additions).toBe(10);
      expect(results[1].commits[0].additions).toBe(20);
    });
  });

  describe('fetchAllPRCommitsBatched', () => {
    let mockGraphqlFn: jest.Mock<any>;

    beforeEach(() => {
      mockGraphqlFn = jest.fn<any>();
      graphql.defaults.mockReturnValue(mockGraphqlFn);
    });

    it('should return empty map for empty PR list', async () => {
      const results = await fetchAllPRCommitsBatched('test-token', 'owner', 'repo', [], mockLogger);

      expect(results.size).toBe(0);
    });

    it('should return Map with correct structure', async () => {
      mockGraphqlFn.mockResolvedValue({
        repository: {
          pr0: {
            number: 1,
            commits: {
              nodes: [
                {
                  commit: {
                    committedDate: '2024-01-10T10:00:00Z',
                    additions: 10,
                    deletions: 5,
                    author: { name: 'Author' },
                  },
                },
              ],
            },
          },
        },
      });

      const results = await fetchAllPRCommitsBatched(
        'test-token',
        'owner',
        'repo',
        [1],
        mockLogger
      );

      expect(results).toBeInstanceOf(Map);
      const entry = results.get(1);
      expect(entry).toHaveProperty('number');
      expect(entry).toHaveProperty('commits');
    });

    it('should split large PR lists into multiple batches (batch size 25)', async () => {
      const prNumbers = Array.from({ length: 40 }, (_, i) => i + 1);

      // First batch response (25 PRs)
      const batch1Response: any = { repository: {} };
      for (let i = 0; i < 25; i++) {
        batch1Response.repository[`pr${i}`] = {
          number: i + 1,
          commits: { nodes: [] },
        };
      }

      // Second batch response (15 PRs)
      const batch2Response: any = { repository: {} };
      for (let i = 0; i < 15; i++) {
        batch2Response.repository[`pr${i}`] = {
          number: i + 26,
          commits: { nodes: [] },
        };
      }

      mockGraphqlFn.mockResolvedValueOnce(batch1Response).mockResolvedValueOnce(batch2Response);

      const results = await fetchAllPRCommitsBatched(
        'test-token',
        'owner',
        'repo',
        prNumbers,
        mockLogger
      );

      expect(mockGraphqlFn).toHaveBeenCalledTimes(2);
      expect(results.size).toBe(40);
    });
  });
});
