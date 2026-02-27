import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { calculateAndStorePRMetrics } from "../pr_metrics";
import {
  createMockGitHubClient,
  mockRepository,
  mockPullRequestBasic,
  mockPullRequest,
  mockCommit,
} from "../../__tests__/utils/mocks";
import type {
  PullRequest,
  PullRequestReview,
  Commit,
  PullRequestBasic,
} from "../../clients/github/types";

// Mock the Port client
jest.mock("../../clients/port", () => ({
  upsertEntitiesInBatches: jest.fn(),
}));

describe("PR Metrics", () => {
  let mockGitHubClient: ReturnType<typeof createMockGitHubClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock client
    mockGitHubClient = createMockGitHubClient();

    // Setup the mock for upsertEntitiesInBatches
    const { upsertEntitiesInBatches } = require("../../clients/port");
    upsertEntitiesInBatches.mockResolvedValue([{ entities: [], errors: [] }]);
  });

  describe("calculateAndStorePRMetrics", () => {
    it("should calculate PR metrics successfully", async () => {
      // Create mock data with recent dates
      const now = new Date();
      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 30 days ago
        closed_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
        merged_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([recentPR])
        .mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([mockCommit]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      // Verify GitHub client calls
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith(
        "test-owner",
        "test-repo",
        {
          state: "closed",
          sort: "created",
          direction: "desc",
          per_page: 100,
          page: 1,
        },
      );

      expect(mockGitHubClient.getPullRequest).toHaveBeenCalledWith(
        "test-owner",
        "test-repo",
        1,
      );
      expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalledWith(
        "test-owner",
        "test-repo",
        1,
      );
      expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalledWith(
        "test-owner",
        "test-repo",
        1,
      );
    });

    it("should handle empty PR list", async () => {
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequest).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestReviews).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommits).not.toHaveBeenCalled();
    });

    it("should handle PRs without merge date", async () => {
      const now = new Date();
      const unmergedPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 30 days ago
        closed_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
        merged_at: null,
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([unmergedPR])
        .mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue({
        ...mockPullRequest,
        merged_at: null,
      });
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getPullRequest).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      // Mock the getPullRequests method to throw an error
      mockGitHubClient.getPullRequests.mockRejectedValue(
        new Error("API Error"),
      );

      const repos = [mockRepository];

      // The function catches errors internally in fetchRepositoryPRs and returns empty PR list
      // so it completes successfully without throwing
      await expect(
        calculateAndStorePRMetrics(repos, mockGitHubClient),
      ).resolves.toBeUndefined();

      // Verify that getPullRequests was called
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
    });

    it("should calculate correct metrics for PR with all data", async () => {
      const now = new Date();
      const testPR: PullRequest = {
        id: 123,
        number: 1,
        created_at: new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 30 days ago
        closed_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
        merged_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
        user: { login: "test-user" },
        additions: 100,
        deletions: 50,
        changed_files: 5,
        comments: 3,
        review_comments: 2,
      };

      const testReviews: PullRequestReview[] = [
        {
          id: 456,
          state: "APPROVED",
          submitted_at: new Date(
            now.getTime() - 29.5 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 29.5 days ago
          user: { login: "reviewer1" },
        },
        {
          id: 457,
          state: "CHANGES_REQUESTED",
          submitted_at: new Date(
            now.getTime() - 29.4 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 29.4 days ago
          user: { login: "reviewer2" },
        },
      ];

      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: new Date(
                now.getTime() - 29.8 * 24 * 60 * 60 * 1000,
              ).toISOString(), // 29.8 days ago
            },
          },
          stats: { total: 10 },
        },
        {
          commit: {
            author: {
              date: new Date(
                now.getTime() - 29.7 * 24 * 60 * 60 * 1000,
              ).toISOString(), // 29.7 days ago
            },
          },
          stats: { total: 20 },
        },
      ];

      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: testPR.created_at,
        closed_at: testPR.closed_at,
        merged_at: testPR.merged_at,
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([recentPR])
        .mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue(testPR);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue(testReviews);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue(testCommits);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      // Verify that upsertEntitiesInBatches was called
      const { upsertEntitiesInBatches } = require("../../clients/port");
      expect(upsertEntitiesInBatches).toHaveBeenCalledWith(
        "githubPullRequest",
        expect.arrayContaining([
          expect.objectContaining({
            identifier: "test-repo1",
            properties: expect.objectContaining({
              pr_size: 150,
              pr_lifetime: expect.any(Number),
              pr_pickup_time: expect.any(Number),
              pr_success_rate: 100,
              review_participation: 2,
            }),
            relations: {
              service: "test-repo",
            },
          }),
        ]),
      );
    });

    it("should handle PRs with missing optional fields", async () => {
      const now = new Date();
      const minimalPR: PullRequest = {
        id: 123,
        number: 1,
        created_at: new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 30 days ago
        closed_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
        merged_at: new Date(
          now.getTime() - 29 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 29 days ago
        user: { login: "test-user" },
        additions: 0,
        deletions: 0,
        changed_files: 0,
        comments: 0,
        review_comments: 0,
      };

      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        created_at: minimalPR.created_at,
        closed_at: minimalPR.closed_at,
        merged_at: minimalPR.merged_at,
      };

      // Mock to return PRs on first call, empty array on subsequent calls (pagination)
      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([recentPR])
        .mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue(minimalPR);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);

      const repos = [mockRepository];

      await calculateAndStorePRMetrics(repos, mockGitHubClient);

      // Verify that upsertEntitiesInBatches was called with entities
      const { upsertEntitiesInBatches } = require("../../clients/port");
      expect(upsertEntitiesInBatches).toHaveBeenCalledWith(
        "githubPullRequest",
        expect.arrayContaining([
          expect.objectContaining({
            identifier: "test-repo1",
            properties: expect.objectContaining({
              pr_size: 0,
              review_participation: 0,
              pr_maturity: null,
            }),
            relations: {
              service: "test-repo",
            },
          }),
        ]),
      );
    });

    it("should dedupe entities that appear in overlapping periods", async () => {
      const now = new Date();
      const recentPR: PullRequestBasic = {
        ...mockPullRequestBasic,
        number: 7,
        created_at: new Date(
          now.getTime() - 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        closed_at: new Date(
          now.getTime() - 9 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        merged_at: new Date(
          now.getTime() - 9 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      mockGitHubClient.getPullRequests
        .mockResolvedValueOnce([recentPR])
        .mockResolvedValueOnce([]);
      mockGitHubClient.getPullRequest.mockResolvedValue({
        ...mockPullRequest,
        number: 7,
      });
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);
      mockGitHubClient.getPullRequestCommits.mockResolvedValue([]);

      await calculateAndStorePRMetrics([mockRepository], mockGitHubClient);

      const { upsertEntitiesInBatches } = require("../../clients/port");
      const [, entities] = upsertEntitiesInBatches.mock.calls[0];
      const identifiers = entities.map((entity: any) => entity.identifier);

      expect(identifiers.filter((id: string) => id === "test-repo7")).toHaveLength(
        1,
      );
    });
  });
});
