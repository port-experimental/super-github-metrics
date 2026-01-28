import { jest, describe, it, expect } from '@jest/globals';
import { hasCompleteOnboardingMetrics } from '../onboarding_metrics';
import type { PortEntity } from '../../clients/port/types';

describe('Onboarding Metrics - Simple Tests', () => {
  describe('hasCompleteOnboardingMetrics', () => {
    it('should return true when all onboarding metrics are present', () => {
      const userWithCompleteMetrics: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          tenth_commit: '2024-01-10T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_pr: '2024-01-15T00:00:00Z',
          time_to_first_commit: 24,
          time_to_first_pr: 96,
          time_to_10th_commit: 240,
          time_to_10th_pr: 312,
          initial_review_response_time: 15,
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithCompleteMetrics)).toBe(true);
    });

    it('should return false when onboarding metrics are missing', () => {
      const userWithIncompleteMetrics: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          // Missing other metrics
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithIncompleteMetrics)).toBe(false);
    });

    it('should return false when properties are undefined', () => {
      const userWithoutProperties: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: undefined,
      };

      expect(hasCompleteOnboardingMetrics(userWithoutProperties)).toBe(false);
    });

    it('should return false when properties are null', () => {
      const userWithNullProperties: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: null,
      };

      expect(hasCompleteOnboardingMetrics(userWithNullProperties)).toBe(false);
    });

    it('should return false when some metrics are null or empty', () => {
      const userWithPartialMetrics: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          tenth_commit: null,
          first_pr: '',
          tenth_pr: '2024-01-15T00:00:00Z',
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithPartialMetrics)).toBe(false);
    });

    it('should return false when all metrics are null or empty', () => {
      const userWithNoValidMetrics: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: {
          first_commit: null,
          tenth_commit: '',
          first_pr: null,
          tenth_pr: '',
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithNoValidMetrics)).toBe(false);
    });

    it('should return true when all metrics have valid string values', () => {
      const userWithValidMetrics: PortEntity = {
        identifier: 'test-user',
        title: 'Test User',
        properties: {
          first_commit: '2024-01-01T00:00:00Z',
          tenth_commit: '2024-01-10T00:00:00Z',
          first_pr: '2024-01-05T00:00:00Z',
          tenth_pr: '2024-01-15T00:00:00Z',
          time_to_first_commit: 24,
          time_to_first_pr: 96,
          time_to_10th_commit: 240,
          time_to_10th_pr: 312,
          initial_review_response_time: 15,
        },
      };

      expect(hasCompleteOnboardingMetrics(userWithValidMetrics)).toBe(true);
    });
  });
});
