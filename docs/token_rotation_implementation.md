# GitHub Token Rotation Implementation

## Overview

This implementation adds automatic token rotation to the GitHub client, allowing the system to use multiple GitHub tokens and automatically switch between them when rate limits are reached. This significantly increases the throughput for GitHub API operations.

## Key Features

### 1. Automatic Token Rotation
- **Multiple Token Support**: Accepts comma-separated list of GitHub tokens
- **Smart Rotation**: Automatically switches to next available token when rate limits are hit
- **Token Reactivation**: Previously exhausted tokens become available again after their reset time
- **Backward Compatibility**: Single token configurations continue to work unchanged

### 2. Rate Limit Management
- **Proactive Monitoring**: Continuously tracks rate limit status for each token
- **Intelligent Switching**: Switches tokens when remaining requests are low (≤5)
- **Graceful Degradation**: Waits for rate limit reset when all tokens are exhausted
- **Detailed Logging**: Provides comprehensive logging of token rotation events

### 3. Error Handling
- **Retry Logic**: Implements exponential backoff for non-rate-limit errors
- **Token Recovery**: Automatically recovers tokens after reset periods
- **Fallback Strategy**: Falls back to waiting when no tokens are available

## Implementation Details

### Core Components

#### 1. TokenRotationManager
```typescript
class TokenRotationManager {
  private tokens: string[];
  private currentTokenIndex: number;
  private tokenStatus: Map<string, TokenStatus>;
}
```

**Responsibilities:**
- Manages multiple GitHub tokens
- Tracks rate limit status for each token
- Implements rotation logic
- Handles token reactivation after reset periods

#### 2. Enhanced GitHubClient
```typescript
class GitHubClient {
  private octokit: Octokit;
  private tokenManager: TokenRotationManager;
  private currentToken: string;
}
```

**Key Enhancements:**
- Integrates with TokenRotationManager
- Automatically rotates tokens during rate limit checks
- Updates token status after each API call
- Maintains backward compatibility

### Usage Examples

#### Single Token (Backward Compatible)
```typescript
const client = createGitHubClient('ghp_single_token_here');
```

#### Multiple Tokens (New Feature)
```typescript
const client = createGitHubClient('ghp_token1,ghp_token2,ghp_token3');
```

#### Environment Variable Configuration
```bash
# Single token
X_GITHUB_TOKEN=ghp_your_token_here

# Multiple tokens
X_GITHUB_TOKEN=ghp_token1,ghp_token2,ghp_token3
```

## Token Rotation Strategy

### 1. Initialization
- Parses comma-separated token string
- Filters out empty/invalid tokens
- Initializes all tokens as available
- Sets first token as current

### 2. Rate Limit Monitoring
- Checks rate limits before each API request
- Updates token status with current limits
- Triggers rotation when remaining requests ≤ 5

### 3. Rotation Logic
- Searches for next available token starting from current position
- Switches to first available token found
- If no tokens available, checks for reactivated tokens
- Falls back to waiting if all tokens exhausted

### 4. Token Reactivation
- Monitors reset times for exhausted tokens
- Automatically reactivates tokens after reset period
- Updates remaining requests to limit value

## Benefits

### 1. Increased Throughput
- **5x Capacity**: With 5 tokens, theoretical capacity increases 5x
- **Continuous Operation**: No waiting for rate limit resets
- **Parallel Processing**: Multiple tokens can be used simultaneously

### 2. Improved Reliability
- **Fault Tolerance**: System continues operating even if some tokens fail
- **Automatic Recovery**: Tokens automatically become available again
- **Graceful Degradation**: Falls back to waiting when needed

### 3. Better User Experience
- **Faster Processing**: Reduced wait times for large operations
- **Transparent Operation**: Users don't need to manage tokens manually
- **Detailed Logging**: Clear visibility into token rotation events

## Configuration

### Environment Variables
```bash
# Single token (existing)
X_GITHUB_TOKEN=ghp_your_token_here

# Multiple tokens (new)
X_GITHUB_TOKEN=ghp_token1,ghp_token2,ghp_token3,ghp_token4,ghp_token5
```

### Token Requirements
- Valid GitHub Personal Access Tokens
- Appropriate permissions for required operations
- Comma-separated format (spaces are automatically trimmed)

## Monitoring and Logging

### Token Rotation Events
```
Initializing GitHub client with 3 tokens for rotation
Rate limit exceeded for current token. Attempting to rotate...
Switched to token 2 of 3
Successfully rotated to next available token
```

### Rate Limit Status
```
Rate limit status: 1000/5000 requests remaining
Reset time: 2024-01-15T10:00:00.000Z
Seconds until reset: 3600
```

## Testing

### Unit Tests
- TokenRotationManager functionality
- GitHubClient integration
- Factory function behavior
- Error handling scenarios

### Test Coverage
- Single token scenarios
- Multiple token scenarios
- Token rotation logic
- Rate limit handling
- Error conditions

## Migration Guide

### For Existing Users
1. **No Changes Required**: Single token configurations continue to work
2. **Optional Enhancement**: Add multiple tokens to increase capacity
3. **Gradual Migration**: Can add tokens incrementally

### For New Implementations
1. **Multiple Tokens Recommended**: Use comma-separated token list
2. **Token Management**: Ensure all tokens have required permissions
3. **Monitoring**: Review logs to understand token rotation behavior

## Best Practices

### 1. Token Management
- Use tokens with appropriate permissions
- Rotate tokens regularly for security
- Monitor token usage and limits

### 2. Configuration
- Use environment variables for token storage
- Separate tokens with commas (no spaces required)
- Validate token format before deployment

### 3. Monitoring
- Review token rotation logs
- Monitor rate limit utilization
- Track API request patterns

## Troubleshooting

### Common Issues

#### 1. "No valid tokens found"
- Ensure at least one valid token is provided
- Check token format (comma-separated)
- Verify tokens are not empty or whitespace-only

#### 2. Rate limit errors persist
- Verify all tokens have appropriate permissions
- Check if all tokens are from the same GitHub account
- Review token rate limits in GitHub settings

#### 3. Token rotation not working
- Ensure multiple tokens are provided
- Check logs for rotation events
- Verify token permissions and validity

### Debug Information
- Enable detailed logging to see token rotation events
- Monitor rate limit status for each token
- Review API response headers for rate limit information 