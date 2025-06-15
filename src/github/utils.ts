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