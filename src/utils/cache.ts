/**
 * Simple in-memory TTL cache for API responses.
 * Reduces redundant API calls for frequently accessed data.
 */

import { DEFAULT_CACHE_TTL_MS, MAX_CACHE_SIZE } from "../constants";

/**
 * Cache entry with value and expiration time
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Configuration options for the cache
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
}

/**
 * Simple TTL-based in-memory cache.
 * Automatically removes expired entries and enforces a maximum size.
 *
 * @example
 * const cache = new TTLCache<string>({ ttlMs: 60000 });
 * cache.set('key', 'value');
 * const value = cache.get('key'); // 'value'
 *
 * @example
 * // Using with async operations
 * const cachedFetch = async (url: string) => {
 *   const cached = cache.get(url);
 *   if (cached) return cached;
 *
 *   const result = await fetch(url);
 *   cache.set(url, result);
 *   return result;
 * };
 */
export class TTLCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxSize = options.maxSize ?? MAX_CACHE_SIZE;
  }

  /**
   * Gets a value from the cache if it exists and hasn't expired.
   *
   * @param key - The cache key
   * @returns The cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Sets a value in the cache with the configured TTL.
   *
   * @param key - The cache key
   * @param value - The value to cache
   * @param customTtlMs - Optional custom TTL for this entry
   */
  set(key: string, value: T, customTtlMs?: number): void {
    // Enforce max size by removing oldest entries
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const ttl = customTtlMs ?? this.ttlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Checks if a key exists in the cache and hasn't expired.
   *
   * @param key - The cache key
   * @returns true if the key exists and hasn't expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Removes a specific key from the cache.
   *
   * @param key - The cache key to remove
   * @returns true if the key was removed
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns the current number of entries in the cache.
   * Note: This includes entries that may have expired but haven't been cleaned up yet.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Gets or sets a value using an async factory function.
   * If the key exists and hasn't expired, returns the cached value.
   * Otherwise, calls the factory function and caches the result.
   *
   * @param key - The cache key
   * @param factory - Async function to create the value if not cached
   * @param customTtlMs - Optional custom TTL for this entry
   * @returns The cached or newly created value
   *
   * @example
   * const user = await cache.getOrSet(
   *   `user:${userId}`,
   *   () => fetchUser(userId)
   * );
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    customTtlMs?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, customTtlMs);
    return value;
  }

  /**
   * Removes all expired entries from the cache.
   * This is called automatically when setting new values,
   * but can be called manually for cleanup.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Gets cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }

  private evictOldest(): void {
    // First, try to remove expired entries
    this.cleanup();

    // If still at capacity, remove the oldest entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }
}

/**
 * Creates a cache key from multiple parts.
 * Useful for creating composite keys for API calls.
 *
 * @param parts - Parts to join into a cache key
 * @returns A cache key string
 *
 * @example
 * const key = createCacheKey('repo', 'owner', 'name');
 * // Returns: 'repo:owner:name'
 */
export function createCacheKey(...parts: (string | number)[]): string {
  return parts.join(":");
}
