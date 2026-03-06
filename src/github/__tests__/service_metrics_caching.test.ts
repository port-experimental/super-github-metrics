import { describe, expect, it, jest } from '@jest/globals';
import type { PullRequestBasic } from '../../clients/github/types';
import {
  analyzePRFromBatchData,
  calculateReviewMetricsFromCache,
  filterReviewDataForPeriod,
} from '../service_metrics';

describe('Service Metrics Caching Optimization', () => {
  describe('filterReviewDataForPeriod', () => {
    it('should filter reviews to only include PRs within time period', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2026-01-30T00:00:00Z',
          user: { login: 'user1' },
        }, // 1 day ago
        {
          id: 2,
          number: 2,
          created_at: '2026-01-26T00:00:00Z',
          user: { login: 'user2' },
        }, // 5 days ago
        {
          id: 3,
          number: 3,
          created_at: '2026-01-02T00:00:00Z',
          user: { login: 'user3' },
        }, // 29 days ago
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T01:00:00Z' }],
        [2, { hasReviews: true, firstReviewAt: '2026-01-26T01:00:00Z' }],
        [3, { hasReviews: false }],
      ]);

      // Filter for 7-day period
      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 7);

      // Should only include PRs 1 and 2
      expect(filtered.size).toBe(2);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(true);
      expect(filtered.has(3)).toBe(false);

      jest.useRealTimers();
    });

    it('should filter for 1-day period', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2026-01-30T12:00:00Z',
          user: { login: 'user1' },
        }, // Within 1 day
        {
          id: 2,
          number: 2,
          created_at: '2026-01-29T00:00:00Z',
          user: { login: 'user2' },
        }, // More than 1 day
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T13:00:00Z' }],
        [2, { hasReviews: false }],
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 1);

      expect(filtered.size).toBe(1);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(false);

      jest.useRealTimers();
    });

    it('should filter for 90-day period', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2026-01-15T00:00:00Z',
          user: { login: 'user1' },
        }, // 16 days ago
        {
          id: 2,
          number: 2,
          created_at: '2025-12-01T00:00:00Z',
          user: { login: 'user2' },
        }, // 61 days ago
        {
          id: 3,
          number: 3,
          created_at: '2025-10-01T00:00:00Z',
          user: { login: 'user3' },
        }, // 122 days ago
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-15T01:00:00Z' }],
        [2, { hasReviews: true, firstReviewAt: '2025-12-01T01:00:00Z' }],
        [3, { hasReviews: false }],
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 90);

      // Should include PRs 1 and 2, but not 3
      expect(filtered.size).toBe(2);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(true);
      expect(filtered.has(3)).toBe(false);

      jest.useRealTimers();
    });

    it('should handle PRs without created_at date', () => {
      const now = new Date('2026-02-01T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2026-01-30T00:00:00Z', // 2 days ago
          user: { login: 'user1' },
        },
        { id: 2, number: 2, created_at: null, user: { login: 'user2' } }, // No created_at
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T01:00:00Z' }],
        [2, { hasReviews: false }],
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 7);

      // Should only include PR 1 (PR 2 has no created_at)
      expect(filtered.size).toBe(1);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(false);

      jest.useRealTimers();
    });

    it('should handle PRs not in review map', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const allPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2026-01-30T00:00:00Z',
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: '2026-01-29T00:00:00Z',
          user: { login: 'user2' },
        },
      ];

      const allReviews = new Map([
        [1, { hasReviews: true, firstReviewAt: '2026-01-30T01:00:00Z' }],
        // PR 2 not in the map
      ]);

      const filtered = filterReviewDataForPeriod(allPRs, allReviews, 7);

      // Should only include PR 1 (PR 2 not in review map)
      expect(filtered.size).toBe(1);
      expect(filtered.has(1)).toBe(true);
      expect(filtered.has(2)).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('calculateReviewMetricsFromCache', () => {
    it('should calculate metrics without API calls', () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T10:00:00Z',
          closed_at: '2024-01-02T10:00:00Z',
          merged_at: '2024-01-02T10:00:00Z',
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: '2024-01-01T11:00:00Z',
          closed_at: '2024-01-02T11:00:00Z',
          merged_at: '2024-01-02T11:00:00Z',
          user: { login: 'user2' },
        },
      ];

      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' }],
        [2, { hasReviews: false }],
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.totalPRs).toBe(2);
      expect(result.totalMergedPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(1);
      expect(result.numberOfPRsMergedWithoutReview).toBe(1);
      expect(result.totalSuccessfulPRs).toBe(2);
      expect(result.prsWithReviewTime).toBe(1);
      expect(result.totalTimeToFirstReview).toBeGreaterThan(0);
    });

    it('should handle empty PR list', () => {
      const reviewsCache = new Map();

      const result = calculateReviewMetricsFromCache([], reviewsCache);

      expect(result.totalPRs).toBe(0);
      expect(result.totalMergedPRs).toBe(0);
      expect(result.numberOfPRsReviewed).toBe(0);
      expect(result.numberOfPRsMergedWithoutReview).toBe(0);
    });

    it('should calculate correct time to first review', () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T00:00:00Z',
          closed_at: '2024-01-03T00:00:00Z',
          merged_at: '2024-01-03T00:00:00Z',
          user: { login: 'user1' },
        },
      ];

      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-02T00:00:00Z' }], // 1 day after creation
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.prsWithReviewTime).toBe(1);
      expect(result.totalTimeToFirstReview).toBe(1); // Exactly 1 day
    });

    it('should handle PRs with missing review data in cache', () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T10:00:00Z',
          closed_at: '2024-01-02T10:00:00Z',
          merged_at: '2024-01-02T10:00:00Z',
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: '2024-01-01T11:00:00Z',
          closed_at: '2024-01-02T11:00:00Z',
          merged_at: '2024-01-02T11:00:00Z',
          user: { login: 'user2' },
        },
      ];

      // Only PR 1 in cache
      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' }],
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.totalPRs).toBe(2);
      expect(result.totalMergedPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(1); // Only PR 1 has review data
      expect(result.numberOfPRsMergedWithoutReview).toBe(1); // PR 2 treated as not reviewed
    });

    it('should handle mixed review scenarios', () => {
      const testPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: '2024-01-01T10:00:00Z',
          closed_at: '2024-01-02T10:00:00Z',
          merged_at: '2024-01-02T10:00:00Z',
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: '2024-01-01T11:00:00Z',
          closed_at: '2024-01-02T11:00:00Z',
          merged_at: null, // Not merged
          user: { login: 'user2' },
        },
        {
          id: 3,
          number: 3,
          created_at: '2024-01-01T12:00:00Z',
          closed_at: '2024-01-02T12:00:00Z',
          merged_at: '2024-01-02T12:00:00Z',
          user: { login: 'user3' },
        },
      ];

      const reviewsCache = new Map([
        [1, { hasReviews: true, firstReviewAt: '2024-01-01T15:00:00Z' }], // Reviewed and merged
        [2, { hasReviews: true, firstReviewAt: '2024-01-01T16:00:00Z' }], // Reviewed but not merged
        [3, { hasReviews: false }], // Merged without review
      ]);

      const result = calculateReviewMetricsFromCache(testPRs, reviewsCache);

      expect(result.totalPRs).toBe(3);
      expect(result.totalMergedPRs).toBe(2);
      expect(result.numberOfPRsReviewed).toBe(2);
      expect(result.numberOfPRsMergedWithoutReview).toBe(1);
      expect(result.totalSuccessfulPRs).toBe(2);
      expect(result.prsWithReviewTime).toBe(2);
    });
  });

  describe('Integration: analyzePRFromBatchData', () => {
    it('should correctly analyze PR with reviews', () => {
      const pr: PullRequestBasic = {
        id: 1,
        number: 1,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'user1' },
      };

      const reviewData = {
        hasReviews: true,
        firstReviewAt: '2024-01-01T15:00:00Z',
      };

      const result = analyzePRFromBatchData(pr, reviewData);

      expect(result.isReviewed).toBe(true);
      expect(result.isMerged).toBe(true);
      expect(result.isMergedWithoutReview).toBe(false);
      expect(result.isSuccessful).toBe(true);
      expect(result.timeToFirstReview).toBeCloseTo(0.208, 2); // ~5 hours in days
    });

    it('should correctly analyze merged PR without reviews', () => {
      const pr: PullRequestBasic = {
        id: 2,
        number: 2,
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-02T10:00:00Z',
        user: { login: 'user1' },
      };

      const reviewData = {
        hasReviews: false,
      };

      const result = analyzePRFromBatchData(pr, reviewData);

      expect(result.isReviewed).toBe(false);
      expect(result.isMerged).toBe(true);
      expect(result.isMergedWithoutReview).toBe(true);
      expect(result.isSuccessful).toBe(true);
      expect(result.timeToFirstReview).toBeUndefined();
    });
  });
});
