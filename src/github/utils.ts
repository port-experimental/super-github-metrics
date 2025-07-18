import { Octokit } from '@octokit/rest';

export async function checkRateLimits(authToken: string) {
  const octokit = new Octokit({ auth: authToken });
  // Let's check I'm not at risk of getting banned for API abuse
  const resp = await octokit.rateLimit.get();
  const limit = resp.headers['x-ratelimit-limit'];
  const remaining = Number.parseInt(resp.headers['x-ratelimit-remaining'] || "0");
  const used = resp.headers['x-ratelimit-used'];
  const resetTime = new Date(Number.parseInt(resp.headers['x-ratelimit-reset'] || "") * 1000);
  const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);
  console.log(`${remaining} requests left, used ${used}/${limit}. Reset at ${resetTime} (${secondsUntilReset}s)`)
  if (remaining === 0) {
    throw Error("Rate limit exceeded");
  }
}

export async function waitForRateLimit(authToken: string) {
  const octokit = new Octokit({ auth: authToken });
  const resp = await octokit.rateLimit.get();
  const remaining = Number.parseInt(resp.headers['x-ratelimit-remaining'] || "0");
  const resetTime = new Date(Number.parseInt(resp.headers['x-ratelimit-reset'] || "") * 1000);
  const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);
  
  if (remaining <= 5) { // Wait if we have 5 or fewer requests left
    console.log(`Rate limit low (${remaining} requests left). Waiting ${secondsUntilReset} seconds until reset...`);
    await new Promise(resolve => setTimeout(resolve, (secondsUntilReset + 10) * 1000)); // Add 10 seconds buffer
    console.log('Rate limit reset, continuing...');
  }
}

/**
 * Makes a GitHub API request with exponential backoff retry logic and rate limit handling
 */
export async function makeRequestWithRetry<T>(
    requestFn: () => Promise<T>, 
    authToken: string,
    maxRetries: number = 3
): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Check rate limits before making request
            await waitForRateLimit(authToken);
            return await requestFn();
        } catch (error: any) {
            lastError = error;

            // For rate limit errors, waitForRateLimit should have handled this
            // Only retry for other types of errors
            if (error.status === 403 || error.status === 429) {
                console.log(`Rate limit error (${error.status}) - this should have been handled by waitForRateLimit`);
                throw error; // Re-throw rate limit errors as they should be handled by waitForRateLimit
            }

            // For other errors, retry with exponential backoff
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`Request failed (${error.status}). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries + 1}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // Max retries reached, throw the error
            throw error;
        }
    }
    
    throw lastError;
}
