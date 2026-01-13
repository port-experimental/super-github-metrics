export class PATTokenManager {
  private tokens: string[];
  private currentTokenIndex: number = 0;
  private tokenRateLimits: Map<string, { remaining: number; reset: number }> =
    new Map();

  constructor(tokens: string[]) {
    this.tokens = tokens.filter((token) => token.trim().length > 0);
    if (this.tokens.length === 0) {
      throw new Error("At least one valid PAT token is required");
    }

    // Initialize rate limit tracking for all tokens
    this.tokens.forEach((token) => {
      this.tokenRateLimits.set(token, {
        remaining: 5000,
        reset: Date.now() + 3600000,
      });
    });
  }

  /**
   * Gets the best available token based on remaining rate limits
   */
  getBestToken(): string {
    const now = Date.now();
    let bestToken = this.tokens[0];
    let maxRemaining = 0;

    for (const [token, limits] of this.tokenRateLimits.entries()) {
      // If token is reset, use it
      if (limits.reset <= now) {
        this.tokenRateLimits.set(token, { remaining: 5000, reset: now + 3600000 });
        return token;
      }

      // Otherwise, find the token with the most remaining requests
      if (limits.remaining > maxRemaining) {
        maxRemaining = limits.remaining;
        bestToken = token;
      }
    }

    return bestToken;
  }

  /**
   * Updates rate limit information for a specific token
   */
  updateRateLimits(token: string, remaining: number, reset: number): void {
    this.tokenRateLimits.set(token, { remaining, reset });
  }

  /**
   * Gets the next token in rotation (for when current token is exhausted)
   */
  getNextToken(): string {
    this.currentTokenIndex = (this.currentTokenIndex + 1) % this.tokens.length;
    return this.tokens[this.currentTokenIndex];
  }

  /**
   * Gets all available tokens
   */
  getAllTokens(): string[] {
    return [...this.tokens];
  }

  /**
   * Gets the number of available tokens
   */
  getTokenCount(): number {
    return this.tokens.length;
  }

  /**
   * Checks if any token has remaining rate limit
   */
  hasAvailableTokens(): boolean {
    const now = Date.now();
    return this.tokens.some((token) => {
      const limits = this.tokenRateLimits.get(token);
      if (!limits) return true;
      return limits.reset <= now || limits.remaining > 0;
    });
  }

  /**
   * Gets rate limit status for all tokens
   */
  getRateLimitStatus(): Array<{ token: string; remaining: number; reset: Date }> {
    const now = Date.now();
    return this.tokens.map((token) => {
      const limits = this.tokenRateLimits.get(token) || {
        remaining: 5000,
        reset: now + 3600000,
      };
      return {
        token: `${token.substring(0, 8)}...`,
        remaining: limits.reset <= now ? 5000 : limits.remaining,
        reset: new Date(limits.reset),
      };
    });
  }
}
