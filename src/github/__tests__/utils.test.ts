import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { filterDataForTimePeriod, filterCommitsForTimePeriod, TIME_PERIODS } from '../utils';
import type { PullRequestBasic, Commit } from '../../types/github';

describe('GitHub Utils', () => {
  describe('filterDataForTimePeriod', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const oneDayAgo = new Date('2024-01-14T12:00:00Z');
    const twoDaysAgo = new Date('2024-01-13T12:00:00Z');
    const eightDaysAgo = new Date('2024-01-07T12:00:00Z');
    const thirtyOneDaysAgo = new Date('2023-12-15T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('PullRequestBasic filtering', () => {
      const mockPRs: PullRequestBasic[] = [
        {
          id: 1,
          number: 1,
          created_at: now.toISOString(),
          closed_at: now.toISOString(),
          merged_at: now.toISOString(),
          user: { login: 'user1' },
        },
        {
          id: 2,
          number: 2,
          created_at: oneDayAgo.toISOString(),
          closed_at: oneDayAgo.toISOString(),
          merged_at: oneDayAgo.toISOString(),
          user: { login: 'user2' },
        },
        {
          id: 3,
          number: 3,
          created_at: twoDaysAgo.toISOString(),
          closed_at: twoDaysAgo.toISOString(),
          merged_at: twoDaysAgo.toISOString(),
          user: { login: 'user3' },
        },
        {
          id: 4,
          number: 4,
          created_at: eightDaysAgo.toISOString(),
          closed_at: eightDaysAgo.toISOString(),
          merged_at: eightDaysAgo.toISOString(),
          user: { login: 'user4' },
        },
        {
          id: 5,
          number: 5,
          created_at: thirtyOneDaysAgo.toISOString(),
          closed_at: thirtyOneDaysAgo.toISOString(),
          merged_at: thirtyOneDaysAgo.toISOString(),
          user: { login: 'user5' },
        },
      ];

      it('should filter PRs for 1 day period', () => {
        const result = filterDataForTimePeriod(mockPRs, TIME_PERIODS.ONE_DAY);
        expect(result).toHaveLength(2); // PRs created today and 1 day ago
        expect(result.map((pr) => pr.id)).toEqual([1, 2]);
      });

      it('should filter PRs for 7 days period', () => {
        const result = filterDataForTimePeriod(mockPRs, TIME_PERIODS.SEVEN_DAYS);
        expect(result).toHaveLength(3); // PRs from today, 1 day ago, and 2 days ago (8 days ago is excluded)
        expect(result.map((pr) => pr.id)).toEqual([1, 2, 3]);
      });

      it('should filter PRs for 30 days period', () => {
        const result = filterDataForTimePeriod(mockPRs, TIME_PERIODS.THIRTY_DAYS);
        expect(result).toHaveLength(4);
        expect(result.map((pr) => pr.id)).toEqual([1, 2, 3, 4]);
      });

      it('should filter PRs for 90 days period', () => {
        const result = filterDataForTimePeriod(mockPRs, TIME_PERIODS.NINETY_DAYS);
        expect(result).toHaveLength(5);
        expect(result.map((pr) => pr.id)).toEqual([1, 2, 3, 4, 5]);
      });

      it('should handle PRs without created_at', () => {
        const prsWithMissingDate = [{ ...mockPRs[0], created_at: undefined }, mockPRs[1]];
        const result = filterDataForTimePeriod(prsWithMissingDate, TIME_PERIODS.ONE_DAY);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
      });
    });
  });

  describe('filterCommitsForTimePeriod', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const oneDayAgo = new Date('2024-01-14T12:00:00Z');
    const twoDaysAgo = new Date('2024-01-13T12:00:00Z');
    const eightDaysAgo = new Date('2024-01-07T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('Commit filtering', () => {
      const mockCommits: Commit[] = [
        {
          commit: {
            author: {
              date: now.toISOString(),
            },
          },
          author: { login: 'user1' },
          stats: { total: 10 },
        },
        {
          commit: {
            author: {
              date: oneDayAgo.toISOString(),
            },
          },
          author: { login: 'user2' },
          stats: { total: 20 },
        },
        {
          commit: {
            author: {
              date: twoDaysAgo.toISOString(),
            },
          },
          author: { login: 'user3' },
          stats: { total: 30 },
        },
        {
          commit: {
            author: {
              date: eightDaysAgo.toISOString(),
            },
          },
          author: { login: 'user4' },
          stats: { total: 40 },
        },
      ];

      it('should filter commits for 1 day period', () => {
        const result = filterCommitsForTimePeriod(mockCommits, TIME_PERIODS.ONE_DAY);
        expect(result).toHaveLength(2); // Commits from today and 1 day ago
        expect(result.map((c) => c.author?.login)).toEqual(['user1', 'user2']);
      });

      it('should filter commits for 7 days period', () => {
        const result = filterCommitsForTimePeriod(mockCommits, TIME_PERIODS.SEVEN_DAYS);
        expect(result).toHaveLength(3); // Commits from today, 1 day ago, and 2 days ago (8 days ago is excluded)
        expect(result.map((c) => c.author?.login)).toEqual(['user1', 'user2', 'user3']);
      });

      it('should filter commits for 30 days period', () => {
        const result = filterCommitsForTimePeriod(mockCommits, TIME_PERIODS.THIRTY_DAYS);
        expect(result).toHaveLength(4);
        expect(result.map((c) => c.author?.login)).toEqual(['user1', 'user2', 'user3', 'user4']);
      });

      it('should handle commits without date', () => {
        const commitsWithMissingDate = [
          { ...mockCommits[0], commit: { author: { date: undefined } } },
          mockCommits[1],
        ];
        const result = filterCommitsForTimePeriod(commitsWithMissingDate, TIME_PERIODS.ONE_DAY);
        expect(result).toHaveLength(1);
        expect(result[0].author?.login).toBe('user2');
      });
    });
  });

  describe('TIME_PERIODS', () => {
    it('should have correct time period values', () => {
      expect(TIME_PERIODS.ONE_DAY).toBe(1);
      expect(TIME_PERIODS.SEVEN_DAYS).toBe(7);
      expect(TIME_PERIODS.THIRTY_DAYS).toBe(30);
      expect(TIME_PERIODS.SIXTY_DAYS).toBe(60);
      expect(TIME_PERIODS.NINETY_DAYS).toBe(90);
    });

    it('should export TimePeriod type', () => {
      // This test ensures the type is exported
      expect(typeof TIME_PERIODS).toBe('object');
    });
  });
});
