/**
 * Utilities for validating and sanitizing metric values.
 * Ensures metrics don't contain NaN, Infinity, or out-of-range values.
 */

import {
  PERCENTAGE_MIN,
  PERCENTAGE_MAX,
  INVALID_METRIC_DEFAULT,
} from "../constants";

/**
 * Checks if a value is a valid finite number.
 *
 * @param value - The value to check
 * @returns true if the value is a finite number, false otherwise
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Sanitizes a numeric metric value, returning a default value if invalid.
 *
 * @param value - The metric value to sanitize
 * @param defaultValue - The default value to return if invalid (defaults to 0)
 * @returns A valid finite number
 *
 * @example
 * sanitizeMetric(NaN) // returns 0
 * sanitizeMetric(Infinity) // returns 0
 * sanitizeMetric(42) // returns 42
 * sanitizeMetric(undefined, -1) // returns -1
 */
export function sanitizeMetric(
  value: unknown,
  defaultValue: number = INVALID_METRIC_DEFAULT
): number {
  if (isValidNumber(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Sanitizes a percentage value, ensuring it's between 0 and 100.
 *
 * @param value - The percentage value to sanitize
 * @param defaultValue - The default value to return if invalid (defaults to 0)
 * @returns A valid percentage between 0 and 100
 *
 * @example
 * sanitizePercentage(50) // returns 50
 * sanitizePercentage(-10) // returns 0
 * sanitizePercentage(150) // returns 100
 * sanitizePercentage(NaN) // returns 0
 */
export function sanitizePercentage(
  value: unknown,
  defaultValue: number = INVALID_METRIC_DEFAULT
): number {
  if (!isValidNumber(value)) {
    return defaultValue;
  }
  return Math.max(PERCENTAGE_MIN, Math.min(PERCENTAGE_MAX, value));
}

/**
 * Safely divides two numbers, returning a default value if the division would result in NaN or Infinity.
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @param defaultValue - The default value to return if division is invalid (defaults to 0)
 * @returns The result of the division or the default value
 *
 * @example
 * safeDivide(10, 2) // returns 5
 * safeDivide(10, 0) // returns 0
 * safeDivide(0, 0) // returns 0
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  defaultValue: number = INVALID_METRIC_DEFAULT
): number {
  if (denominator === 0 || !isValidNumber(numerator) || !isValidNumber(denominator)) {
    return defaultValue;
  }
  const result = numerator / denominator;
  return isValidNumber(result) ? result : defaultValue;
}

/**
 * Safely calculates a percentage, returning a default value if the calculation would result in NaN or Infinity.
 *
 * @param part - The part (numerator)
 * @param total - The total (denominator)
 * @param defaultValue - The default value to return if calculation is invalid (defaults to 0)
 * @returns The percentage (0-100) or the default value
 *
 * @example
 * safePercentage(25, 100) // returns 25
 * safePercentage(1, 3) // returns 33.333...
 * safePercentage(10, 0) // returns 0
 */
export function safePercentage(
  part: number,
  total: number,
  defaultValue: number = INVALID_METRIC_DEFAULT
): number {
  const result = safeDivide(part, total, defaultValue / 100) * 100;
  return sanitizePercentage(result, defaultValue);
}

/**
 * Safely calculates an average, returning a default value if the calculation would result in NaN or Infinity.
 *
 * @param values - Array of values to average
 * @param defaultValue - The default value to return if calculation is invalid (defaults to 0)
 * @returns The average or the default value
 *
 * @example
 * safeAverage([1, 2, 3]) // returns 2
 * safeAverage([]) // returns 0
 * safeAverage([NaN, 1, 2]) // returns 0 (treats NaN as invalid)
 */
export function safeAverage(
  values: number[],
  defaultValue: number = INVALID_METRIC_DEFAULT
): number {
  if (values.length === 0) {
    return defaultValue;
  }

  const validValues = values.filter(isValidNumber);
  if (validValues.length === 0) {
    return defaultValue;
  }

  const sum = validValues.reduce((acc, val) => acc + val, 0);
  return safeDivide(sum, validValues.length, defaultValue);
}

/**
 * Safely calculates standard deviation, returning a default value if the calculation would result in NaN or Infinity.
 *
 * @param values - Array of values
 * @param defaultValue - The default value to return if calculation is invalid (defaults to 0)
 * @returns The standard deviation or the default value
 *
 * @example
 * safeStandardDeviation([1, 2, 3, 4, 5]) // returns ~1.41
 * safeStandardDeviation([]) // returns 0
 * safeStandardDeviation([5]) // returns 0
 */
export function safeStandardDeviation(
  values: number[],
  defaultValue: number = INVALID_METRIC_DEFAULT
): number {
  if (values.length <= 1) {
    return defaultValue;
  }

  const validValues = values.filter(isValidNumber);
  if (validValues.length <= 1) {
    return defaultValue;
  }

  const mean = safeAverage(validValues, defaultValue);
  if (mean === defaultValue && validValues.length === 0) {
    return defaultValue;
  }

  const squaredDifferences = validValues.map((val) => (val - mean) ** 2);
  const variance = safeDivide(
    squaredDifferences.reduce((acc, val) => acc + val, 0),
    validValues.length,
    defaultValue
  );

  const stdDev = Math.sqrt(variance);
  return isValidNumber(stdDev) ? stdDev : defaultValue;
}

/**
 * Validates and sanitizes an entire metrics object, replacing invalid values with defaults.
 *
 * @param metrics - The metrics object to validate
 * @param percentageFields - Array of field names that should be treated as percentages
 * @returns A new object with all invalid values replaced
 *
 * @example
 * validateMetricsObject(
 *   { count: 10, rate: NaN, percentage: 150 },
 *   ['percentage']
 * )
 * // returns { count: 10, rate: 0, percentage: 100 }
 */
export function validateMetricsObject<T extends Record<string, unknown>>(
  metrics: T,
  percentageFields: (keyof T)[] = []
): T {
  const result = { ...metrics };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number") {
      if (percentageFields.includes(key as keyof T)) {
        (result as Record<string, unknown>)[key] = sanitizePercentage(value);
      } else {
        (result as Record<string, unknown>)[key] = sanitizeMetric(value);
      }
    }
  }

  return result;
}
