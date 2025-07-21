# Error Handling Strategy

## Overview

This document describes the improved error handling strategy implemented in the GitHub metrics collection system. The goal is to provide clear visibility into failures while allowing for graceful degradation where appropriate.

## Error Types

### 1. Fatal Errors
- **Definition**: Errors that should cause the entire process to fail and exit with a non-zero code
- **Examples**: 
  - Missing required environment variables
  - Authentication failures
  - All repositories failing to process
  - Critical API failures

### 2. Non-Fatal Errors
- **Definition**: Errors that should be logged but allow the process to continue
- **Examples**:
  - Individual repository failures (when some succeed)
  - Individual PR/workflow failures (when others succeed)
  - Permission issues for audit logs (can continue without them)

## Error Handling Strategy

### Main Process Level (`src/github/main.ts`)

1. **Environment Validation**: Validates all required environment variables upfront
2. **Command-Level Error Handling**: Each command properly propagates fatal errors
3. **Process Exit**: Fatal errors cause `process.exit(1)` to indicate failure

### Repository Level

1. **Individual Repository Failures**: Logged but don't fail the entire process
2. **All Repository Failures**: Treated as fatal error
3. **Partial Failures**: Warning logged, process continues

### Individual Item Level (PRs, Workflows, etc.)

1. **Individual Item Failures**: Logged but don't fail the repository
2. **Continue Processing**: Process continues with remaining items

## Implementation Details

### Custom Error Class

```typescript
class FatalError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'FatalError';
  }
}
```

### Error Propagation Pattern

```typescript
try {
  // Process repositories
  for (const repo of repos) {
    try {
      await processRepository(repo);
    } catch (error) {
      console.error(`Error processing repo ${repo.name}:`, error);
      failedRepos.push(repo.name);
      hasFatalError = true;
    }
  }

  // Check if all repositories failed
  if (failedRepos.length === repos.length && repos.length > 0) {
    throw new Error(`Failed to process any repositories. Failed repos: ${failedRepos.join(', ')}`);
  }

  // Log warnings for partial failures
  if (failedRepos.length > 0) {
    console.warn(`Warning: Failed to process ${failedRepos.length} repositories: ${failedRepos.join(', ')}`);
  }
} catch (error) {
  if (error instanceof FatalError) {
    throw error;
  }
  throw new FatalError('Unexpected error', error as Error);
}
```

## Exit Codes

- **0**: Success (all operations completed successfully or with acceptable partial failures)
- **1**: Fatal error (process should be considered failed)

## Logging Strategy

### Error Levels

1. **console.error()**: For fatal errors and critical failures
2. **console.warn()**: For non-fatal errors that should be noted
3. **console.log()**: For informational messages

### Error Context

All error messages include:
- Repository name (when applicable)
- Specific operation that failed
- Original error details (when available)

## Examples

### Successful Run with Partial Failures
```
Processing repo example-repo (1/3)
  Found 50 PRs in the last 90 days
  Processing 1 day period...
  Filtered to 5 PRs for 1 day period
Processing repo another-repo (2/3)
  Error processing repo another-repo: API rate limit exceeded
Processing repo third-repo (3/3)
  Found 30 PRs in the last 90 days
  Processing 1 day period...
  Filtered to 2 PRs for 1 day period

Warning: Failed to process 1 repositories: another-repo
```

### Fatal Error
```
Fatal error: Missing required environment variables: X_GITHUB_TOKEN
```

### All Repositories Failed
```
Error processing repo repo1: API rate limit exceeded
Error processing repo repo2: Authentication failed
Error processing repo repo3: Network timeout

Fatal error: Failed to process any repositories. Failed repos: repo1, repo2, repo3
```

## Benefits

1. **Clear Failure Indication**: Process exits with non-zero code when there are fatal errors
2. **Graceful Degradation**: Partial failures don't cause complete process failure
3. **Detailed Logging**: Comprehensive error information for debugging
4. **CI/CD Integration**: Proper exit codes for automated workflows
5. **Monitoring**: Clear distinction between fatal and non-fatal errors

## Testing Error Handling

### Test Scenarios

1. **Missing Environment Variables**: Should exit with code 1
2. **Authentication Failure**: Should exit with code 1
3. **All Repositories Fail**: Should exit with code 1
4. **Some Repositories Fail**: Should continue with warnings
5. **Individual Items Fail**: Should continue processing

### Manual Testing

```bash
# Test missing environment variables
unset X_GITHUB_TOKEN
npm run github-sync pr-metrics
# Should exit with code 1

# Test with valid configuration
npm run github-sync pr-metrics
# Should exit with code 0 (success) or 1 (fatal error)
```

## Future Improvements

1. **Structured Logging**: Implement structured logging for better error parsing
2. **Error Metrics**: Track error rates and types for monitoring
3. **Retry Logic**: Implement retry logic for transient failures
4. **Circuit Breaker**: Implement circuit breaker pattern for API calls
5. **Error Reporting**: Integrate with error reporting services 