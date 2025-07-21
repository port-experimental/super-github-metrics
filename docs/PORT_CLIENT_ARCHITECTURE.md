# PortClient Architecture

## Overview

The Port client has been reorganized to use a proper class-based architecture with automatic token management. All functionality is now contained within the `PortClient` class, providing better encapsulation, token validation, and automatic regeneration capabilities.

## Key Features

### 1. Automatic Token Management
- **Token Validation**: Checks token validity before each request
- **Automatic Regeneration**: Regenerates expired tokens automatically
- **Expiry Tracking**: Tracks token expiry time from the OAuth response
- **Buffer Time**: Regenerates tokens 5 minutes before expiry to prevent failures

### 2. Singleton Pattern
- **Single Instance**: Ensures only one client instance exists
- **Shared Token**: All requests use the same token instance
- **Thread Safe**: Safe for concurrent usage

### 3. Error Handling
- **401 Retry**: Automatically retries failed requests with new token
- **Graceful Degradation**: Handles token failures gracefully
- **Detailed Logging**: Provides clear error messages

### 4. Self-Contained Design
- **All Methods in Class**: No external function dependencies
- **Static Methods**: Convenient access without instantiation
- **Backward Compatibility**: Legacy function exports still work

## Architecture

### PortClient Class

```typescript
export class PortClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiryTime: number | null = null;
  private clientId: string;
  private clientSecret: string;
  private static instance: PortClient | null = null;

  // Instance methods for direct usage
  async getUsers(): Promise<PortEntitiesResponse> { ... }
  async upsertProps(...): Promise<unknown> { ... }
  
  // Static methods for convenience
  static async getUsers(): Promise<PortEntitiesResponse> { ... }
  static async upsertProps(...): Promise<unknown> { ... }
}
```

### Token Management Flow

1. **Initialization**: 
   - Check for `PORT_BEARER_TOKEN` environment variable
   - If present, use it with 24-hour expiry
   - If not present, generate OAuth token

2. **Request Flow**:
   - Check token validity before each request
   - If token is expired or will expire soon, regenerate
   - Make authenticated request
   - If 401 error, regenerate token and retry once

3. **Token Regeneration**:
   - Call Port OAuth endpoint
   - Store new token and expiry time
   - Log generation success

## Usage Examples

### Instance-Based Usage (Recommended)

```typescript
import { PortClient } from './clients/port';

async function example() {
  // Get singleton instance
  const client = await PortClient.getInstance();
  
  // Check token status
  const tokenInfo = client.getTokenInfo();
  console.log('Token expires at:', tokenInfo.expiresAt);
  
  // Make requests - token management is automatic
  const users = await client.getUsers();
  const entities = await client.getEntities('githubUser');
  
  // Upsert operations
  await client.upsertProps('githubUser', 'user123', {
    last_updated: new Date().toISOString()
  });
}
```

### Static Method Usage (Convenient)

```typescript
import { PortClient } from './clients/port';

async function staticExample() {
  // Use static methods directly - no need to get instance
  const users = await PortClient.getUsers();
  const entities = await PortClient.getEntities('githubUser');
  
  await PortClient.upsertProps('githubUser', 'user123', {
    status: 'active'
  });
}
```

### Legacy Function Usage (Backward Compatible)

```typescript
import { getUsers, upsertProps } from './clients/port';

async function legacyExample() {
  // These functions now use PortClient internally
  const users = await getUsers();
  await upsertProps('githubUser', 'user123', {
    status: 'active'
  });
}
```

## Token Management Details

### Environment Variables

- `PORT_CLIENT_ID`: Required for OAuth token generation
- `PORT_CLIENT_SECRET`: Required for OAuth token generation
- `PORT_BEARER_TOKEN`: Optional, if provided will be used instead of OAuth

### Token Expiry Handling

```typescript
private async ensureValidToken(): Promise<void> {
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

  if (!this.accessToken || !this.tokenExpiryTime || 
      (this.tokenExpiryTime - now) < bufferTime) {
    await this.generateNewToken();
  }
}
```

### Automatic Retry Logic

```typescript
try {
  const response = await axios(config);
  return response.data;
} catch (error) {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    // Token invalid, regenerate and retry
    await this.generateNewToken();
    config.headers.Authorization = `Bearer ${this.accessToken}`;
    const retryResponse = await axios(config);
    return retryResponse.data;
  }
  throw error;
}
```

## API Methods

### Instance Methods (Direct Usage)
- `get<T>(endpoint, params?)`: GET request
- `post<T>(endpoint, data)`: POST request
- `patch<T>(endpoint, data)`: PATCH request
- `delete(endpoint)`: DELETE request
- `getEntities(entityType)`: Get all entities of a type
- `getEntity(entityType, identifier)`: Get specific entity
- `upsertProps(entity, identifier, properties)`: Upsert entity properties
- `upsertEntity(entity, identifier, title, properties, relations, team?)`: Upsert complete entity
- `createEntity(blueprint, entity)`: Create new entity
- `updateEntity(blueprint, entity)`: Update existing entity
- `deleteAllEntities(entityType)`: Delete all entities of a type
- `getUsers()`: Get all users
- `getUser(identifier)`: Get specific user
- `getTokenInfo()`: Get current token status

### Static Methods (Convenience)
- `getInstance()`: Get singleton instance
- `getClient()`: Alias for getInstance
- `getEntities(entityType)`: Get all entities of a type
- `getEntity(entityType, identifier)`: Get specific entity
- `upsertProps(entity, identifier, properties)`: Upsert entity properties
- `upsertEntity(entity, identifier, title, properties, relations, team?)`: Upsert complete entity
- `createEntity(blueprint, entity)`: Create new entity
- `updateEntity(blueprint, entity)`: Update existing entity
- `deleteAllEntities(entityType)`: Delete all entities of a type
- `getUsers()`: Get all users
- `getUser(identifier)`: Get specific user

### Legacy Function Exports
All legacy function exports continue to work and now use the static methods internally:
- `getEntities()`
- `upsertProps()`
- `updateEntity()`
- `getUsers()`
- etc.

## Benefits

### 1. Reliability
- **No Token Failures**: Automatic regeneration prevents token expiry issues
- **Retry Logic**: Handles temporary token invalidation
- **Buffer Time**: Prevents edge cases with token expiry

### 2. Maintainability
- **Single Responsibility**: Each method has a clear purpose
- **Encapsulation**: Token management is hidden from consumers
- **Type Safety**: Full TypeScript support with generics
- **Self-Contained**: All functionality within the class

### 3. Performance
- **Singleton Pattern**: Reuses token across requests
- **Lazy Loading**: Only generates token when needed
- **Efficient Retry**: Only retries on actual token failures

### 4. Developer Experience
- **Simple API**: Easy to use methods
- **Multiple Usage Patterns**: Instance, static, or legacy functions
- **Backward Compatibility**: Existing code continues to work
- **Clear Error Messages**: Helpful debugging information

## Migration Guide

### From Old API to New API

**Before:**
```typescript
import { getClient } from './clients/port';

const client = await getClient();
const users = await client.get('/blueprints/_user/entities');
```

**After (Instance-based):**
```typescript
import { PortClient } from './clients/port';

const client = await PortClient.getInstance();
const users = await client.getUsers();
```

**After (Static-based):**
```typescript
import { PortClient } from './clients/port';

const users = await PortClient.getUsers();
```

### Legacy Functions Still Work

All existing function exports continue to work:
- `getEntities()`
- `upsertProps()`
- `updateEntity()`
- etc.

These now use the PortClient static methods internally, so you get all the benefits without changing existing code.

## Error Handling

### Common Error Scenarios

1. **Missing Environment Variables**:
   ```
   Error: PORT_CLIENT_ID and PORT_CLIENT_SECRET must be set in environment variables
   ```

2. **OAuth Token Generation Failure**:
   ```
   Error: Failed to generate OAuth token
   ```

3. **Invalid Token (401)**:
   ```
   Token appears invalid, regenerating...
   ```

### Debugging

Use `getTokenInfo()` to check token status:

```typescript
// Instance-based
const client = await PortClient.getInstance();
const tokenInfo = client.getTokenInfo();
console.log('Token status:', tokenInfo);

// Static-based
const client = await PortClient.getInstance();
const tokenInfo = client.getTokenInfo();
console.log('Token status:', tokenInfo);
// Output: { hasToken: true, expiresAt: Date, isExpired: false }
```

## Future Enhancements

1. **Token Caching**: Cache tokens to disk for persistence
2. **Rate Limiting**: Implement request rate limiting
3. **Connection Pooling**: Optimize HTTP connections
4. **Metrics**: Add request/response metrics
5. **Circuit Breaker**: Implement circuit breaker pattern 