/**
 * Shared utility functions for GitHub metrics optimization.
 * Re-exports constants from the central constants file for convenience.
 */

import {
  TIME_PERIODS as CENTRAL_TIME_PERIODS,
  type TimePeriod as CentralTimePeriod,
  CONCURRENCY as CENTRAL_CONCURRENCY,
  MS_PER_DAY,
} from "../constants";

// Re-export constants for backward compatibility
export const TIME_PERIODS = CENTRAL_TIME_PERIODS;
export type TimePeriod = CentralTimePeriod;

// Map the CONCURRENCY constant to the old CONCURRENCY_LIMITS name for backward compatibility
export const CONCURRENCY_LIMITS = CENTRAL_CONCURRENCY;

/**
 * Filters data for a specific time period based on created_at field.
 *
 * @param data - Array of items with created_at field
 * @param daysBack - Number of days to look back
 * @returns Filtered array containing only items within the time period
 */
export function filterDataForTimePeriod<T extends { created_at: string }>(
  data: T[],
  daysBack: TimePeriod
): T[] {
  const cutoffDate = createCutoffDate(daysBack);
  return data.filter((item) => {
    const itemDate = new Date(item.created_at);
    return itemDate >= cutoffDate;
  });
}

/**
 * Filters commits for a specific time period based on commit.author.date.
 *
 * @param data - Array of commit objects
 * @param daysBack - Number of days to look back
 * @returns Filtered array containing only commits within the time period
 */
export function filterCommitsForTimePeriod<T extends { commit?: { author?: { date?: string } } }>(
  data: T[],
  daysBack: number
): T[] {
  const cutoffDate = createCutoffDate(daysBack);
  return data.filter((item) => {
    const dateValue = item.commit?.author?.date;
    if (!dateValue) return false;
    return new Date(dateValue) >= cutoffDate;
  });
}

/**
 * Filters data for a specific time period based on a custom date field.
 *
 * @param data - Array of items
 * @param daysBack - Number of days to look back
 * @param dateField - The field name containing the date string
 * @returns Filtered array containing only items within the time period
 */
export function filterDataForTimePeriodByField<T>(
  data: T[],
  daysBack: number,
  dateField: keyof T
): T[] {
  const cutoffDate = createCutoffDate(daysBack);
  return data.filter((item) => {
    const dateValue = item[dateField];
    if (typeof dateValue === 'string') {
      return new Date(dateValue) >= cutoffDate;
    }
    return false;
  });
}

/**
 * Gets the maximum time period from an array of time periods.
 *
 * @param timePeriods - Array of time periods
 * @returns The maximum time period value
 */
export function getMaxTimePeriod(timePeriods: TimePeriod[]): TimePeriod {
  return Math.max(...timePeriods) as TimePeriod;
}

/**
 * Creates a cutoff date for a given number of days back.
 *
 * @param daysBack - Number of days to go back from now
 * @returns Date object representing the cutoff date
 */
export function createCutoffDate(daysBack: number): Date {
  return new Date(Date.now() - daysBack * MS_PER_DAY);
}
