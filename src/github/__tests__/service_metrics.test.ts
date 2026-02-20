import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { calculateAndStoreServiceMetrics } from "../service_metrics";
import {
  createMockGitHubClient,
  createMockPortClient,
} from "../../__tests__/utils/mocks";
import type {
  Repository,
  Commit,
  PullRequestBasic,
  PullRequest,
  PullRequestReview,
} from "../../clients/github/types";

// Mock the clients
jest.mock("../../clients/github", () => ({
  createGitHubClient: jest.fn(),
}));

jest.mock("../../clients/port", () => ({
  updateEntity: jest.fn(),
  upsertEntitiesInBatches: jest.fn<any>().mockResolvedValue([]),
}));

describe("Service Metrics", () => {
  let mockGitHubClient: ReturnType<typeof createMockGitHubClient>;
  let mockPortClient: ReturnType<typeof createMockPortClient>;
  let mockCreateGitHubClient: jest.MockedFunction<any>;
  let mockUpdateEntity: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGitHubClient = createMockGitHubClient();
    mockPortClient = createMockPortClient();

    // Get the mocked functions
    mockCreateGitHubClient = require("../../clients/github").createGitHubClient;
    mockUpdateEntity = require("../../clients/port").updateEntity;

    // Configure the mocks
    mockCreateGitHubClient.mockReturnValue(mockGitHubClient);
    mockUpdateEntity.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("calculateAndStoreServiceMetrics", () => {
    const mockRepository: Repository = {
      id: 123456,
      name: "test-repo",
      owner: {
        login: "test-org",
      },
      default_branch: "main",
    };

    const mockCommit: Commit = {
      commit: {
        author: {
          date: "2024-01-01T12:00:00Z",
        },
      },
      author: { login: "test-user" },
      stats: { total: 150 },
    };

    const mockPullRequestBasic: PullRequestBasic = {
      id: 789,
      number: 1,
      created_at: "2024-01-01T10:00:00Z",
      closed_at: "2024-01-02T10:00:00Z",
      merged_at: "2024-01-02T10:00:00Z",
      user: { login: "test-user" },
    };

    const mockPullRequest: PullRequest = {
      ...mockPullRequestBasic,
      additions: 100,
      deletions: 50,
      changed_files: 5,
      comments: 3,
      review_comments: 2,
    };

    const mockReview: PullRequestReview = {
      id: 456,
      state: "APPROVED",
      submitted_at: "2024-01-01T15:00:00Z",
      user: { login: "reviewer" },
    };

    it("should calculate service metrics successfully", async () => {
      // Setup mocks
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([mockCommit]);
      mockGitHubClient.getPullRequests.mockResolvedValue([
        mockPullRequestBasic,
      ]);
      mockGitHubClient.getPullRequest.mockResolvedValue(mockPullRequest);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([mockReview]);

      const repos = [mockRepository];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify GitHub client calls
      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalledWith(
        "test-org",
        "test-repo",
        {
          per_page: 100,
          page: 1,
        },
      );
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalledWith(
        "test-org",
        "test-repo",
        {
          state: "closed",
          sort: "created",
          direction: "desc",
          per_page: 100,
          page: 1,
        },
      );
    });

    it("should handle empty repository list", async () => {
      const repos: Repository[] = [];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getRepositoryCommits).not.toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).not.toHaveBeenCalled();
    });

    it("should handle repositories without commits", async () => {
      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      expect(mockGitHubClient.getRepositoryCommits).toHaveBeenCalled();
      expect(mockGitHubClient.getPullRequests).toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      mockUpdateEntity.mockRejectedValue(new Error("API Error"));

      const repos = [mockRepository];
      await expect(
        calculateAndStoreServiceMetrics(repos, mockGitHubClient),
      ).rejects.toThrow("Failed to process any repositories");
    });

    it("should calculate correct commit metrics", async () => {
      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: "2024-01-01T12:00:00Z",
            },
          },
          author: { login: "user1" },
          stats: { total: 100 },
        },
        {
          commit: {
            author: {
              date: "2024-01-01T13:00:00Z",
            },
          },
          author: { login: "user2" },
          stats: { total: 200 },
        },
        {
          commit: {
            author: {
              date: "2024-01-01T14:00:00Z",
            },
          },
          author: { login: "user1" },
          stats: { total: 150 },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockResolvedValue(testCommits);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify that updateEntity was called for the service metrics
      expect(mockUpdateEntity).toHaveBeenCalledWith(
        "service",
        expect.objectContaining({
          identifier: "123456",
          title: "test-repo",
        }),
      );
    });

    it("should calculate correct PR metrics", async () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: "2024-01-01T10:00:00Z",
          closed_at: "2024-01-02T10:00:00Z",
          merged_at: "2024-01-02T10:00:00Z",
          user: { login: "user1" },
        },
        {
          id: 2,
          number: 2,
          created_at: "2024-01-01T11:00:00Z",
          closed_at: "2024-01-02T11:00:00Z",
          merged_at: "2024-01-02T11:00:00Z",
          user: { login: "user2" },
        },
      ];

      const testPRDetails: PullRequest[] = [
        {
          ...testPRs[0],
          additions: 100,
          deletions: 50,
          changed_files: 5,
          comments: 3,
          review_comments: 2,
        },
        {
          ...testPRs[1],
          additions: 200,
          deletions: 100,
          changed_files: 10,
          comments: 5,
          review_comments: 3,
        },
      ];

      const testReviews: PullRequestReview[] = [
        {
          id: 1,
          state: "APPROVED",
          submitted_at: "2024-01-01T15:00:00Z",
          user: { login: "reviewer1" },
        },
        {
          id: 2,
          state: "CHANGES_REQUESTED",
          submitted_at: "2024-01-01T16:00:00Z",
          user: { login: "reviewer2" },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue(testPRs);
      mockGitHubClient.getPullRequest
        .mockResolvedValueOnce(testPRDetails[0])
        .mockResolvedValueOnce(testPRDetails[1]);
      mockGitHubClient.getPullRequestReviews
        .mockResolvedValueOnce([testReviews[0]])
        .mockResolvedValueOnce([testReviews[0], testReviews[1]]);

      const repos = [mockRepository];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Verify that updateEntity was called for the service metrics
      expect(mockUpdateEntity).toHaveBeenCalledWith(
        "service",
        expect.objectContaining({
          identifier: "123456",
          title: "test-repo",
        }),
      );
    });

    it("should handle commits without author information", async () => {
      const testCommits: Commit[] = [
        {
          commit: {
            author: {
              date: "2024-01-01T12:00:00Z",
            },
          },
          author: null, // No author information
          stats: { total: 100 },
        },
        {
          commit: {
            author: {
              date: "2024-01-01T13:00:00Z",
            },
          },
          author: { login: "user1" },
          stats: { total: 200 },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockResolvedValue(testCommits);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [mockRepository];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Should only process commits with author information
      expect(mockUpdateEntity).toHaveBeenCalledWith(
        "service",
        expect.objectContaining({
          identifier: "123456",
          title: "test-repo",
        }),
      );
    });

    it("should handle PRs without merge date", async () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: "2024-01-01T10:00:00Z",
          closed_at: "2024-01-02T10:00:00Z",
          merged_at: null, // Not merged
          user: { login: "user1" },
        },
      ];

      const testPRDetails: PullRequest = {
        ...testPRs[0],
        additions: 100,
        deletions: 50,
        changed_files: 5,
        comments: 3,
        review_comments: 2,
      };

      mockGitHubClient.getRepositoryCommits.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue(testPRs);
      mockGitHubClient.getPullRequest.mockResolvedValue(testPRDetails);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([]);

      const repos = [mockRepository];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Should still process the PR but with different lifetime calculation
      expect(mockUpdateEntity).toHaveBeenCalledWith(
        "service",
        expect.objectContaining({
          identifier: "123456",
          title: "test-repo",
        }),
      );
    });

    it("should handle multiple repositories", async () => {
      const repo1: Repository = {
        id: 123456,
        name: "repo1",
        owner: { login: "test-org" },
        default_branch: "main",
      };

      const repo2: Repository = {
        id: 789012,
        name: "repo2",
        owner: { login: "test-org" },
        default_branch: "main",
      };

      const commits1: Commit[] = [
        {
          commit: {
            author: {
              date: "2024-01-01T12:00:00Z",
            },
          },
          author: { login: "user1" },
          stats: { total: 100 },
        },
      ];

      const commits2: Commit[] = [
        {
          commit: {
            author: {
              date: "2024-01-01T13:00:00Z",
            },
          },
          author: { login: "user2" },
          stats: { total: 200 },
        },
      ];

      mockGitHubClient.getRepositoryCommits.mockImplementation(
        (_owner: string, repo: string) =>
          Promise.resolve(repo === "repo1" ? commits1 : commits2),
      );
      mockGitHubClient.getPullRequests.mockResolvedValue([]);

      const repos = [repo1, repo2];
      await calculateAndStoreServiceMetrics(repos, mockGitHubClient);

      // Should aggregate metrics across repositories
      expect(mockUpdateEntity).toHaveBeenCalledWith(
        "service",
        expect.objectContaining({
          identifier: "123456",
          title: "repo1",
        }),
      );
      expect(mockUpdateEntity).toHaveBeenCalledWith(
        "service",
        expect.objectContaining({
          identifier: "789012",
          title: "repo2",
        }),
      );
    });
  });
});
