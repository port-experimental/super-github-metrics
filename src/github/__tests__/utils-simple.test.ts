import { jest, describe, it, expect } from '@jest/globals';
import { TIME_PERIODS, type TimePeriod, createCutoffDate, getMaxTimePeriod } from '../utils';

describe('GitHub Utils - Simple Tests', () => {
  describe('TIME_PERIODS constants', () => {
    it('should have correct time period values', () => {
      expect(TIME_PERIODS.ONE_DAY).toBe(1);
      expect(TIME_PERIODS.SEVEN_DAYS).toBe(7);
      expect(TIME_PERIODS.THIRTY_DAYS).toBe(30);
      expect(TIME_PERIODS.SIXTY_DAYS).toBe(60);
      expect(TIME_PERIODS.NINETY_DAYS).toBe(90);
    });

    it('should export TimePeriod type', () => {
      // This is a type check - if it compiles, the type is exported correctly
      const periods: TimePeriod[] = [1, 7, 30, 60, 90];
      expect(periods).toBeDefined();
      expect(periods.length).toBe(5);
    });
  });

  describe('createCutoffDate', () => {
    it('should create a cutoff date for given days back', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const cutoffDate = createCutoffDate(7);
      const expectedDate = new Date('2024-01-08T12:00:00Z');

      expect(cutoffDate.getTime()).toBe(expectedDate.getTime());

      jest.useRealTimers();
    });

    it('should handle zero days back', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const cutoffDate = createCutoffDate(0);
      const expectedDate = new Date('2024-01-15T12:00:00Z');

      expect(cutoffDate.getTime()).toBe(expectedDate.getTime());

      jest.useRealTimers();
    });
  });

  describe('getMaxTimePeriod', () => {
    it('should return the maximum time period from an array', () => {
      const periods: TimePeriod[] = [1, 7, 30, 60, 90];
      const maxPeriod = getMaxTimePeriod(periods);
      expect(maxPeriod).toBe(90);
    });

    it('should handle single time period', () => {
      const periods: TimePeriod[] = [30];
      const maxPeriod = getMaxTimePeriod(periods);
      expect(maxPeriod).toBe(30);
    });

    it('should handle empty array', () => {
      const periods: TimePeriod[] = [];
      const maxPeriod = getMaxTimePeriod(periods);
      expect(maxPeriod).toBe(-Infinity);
    });
  });
});
