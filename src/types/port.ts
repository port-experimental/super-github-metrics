export interface OAuthResponse {
  accessToken: string;
  expiresIn: number; // Token expiry time in seconds
}

export interface PortEntity {
  identifier?: string;
  title?: string;
  properties?: Record<string, unknown> | null;
  relations?: Record<string, unknown> | null;
  team?: string[] | null;
  [key: string]: unknown;
}

export interface PortResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
}

export interface PortEntitiesResponse {
  entities: PortEntity[];
  ok: boolean;
}

export interface PortEntityResponse {
  entity: PortEntity;
  ok: boolean;
}

export interface PortUpsertPayload {
  identifier: string;
  title?: string;
  properties?: Record<string, unknown>;
  relations?: Record<string, unknown>;
  team?: string[];
  [key: string]: unknown;
}

// Bulk operations types
export interface PortBulkEntitiesRequest {
  entities: PortEntity[];
}

export interface PortBulkEntityResult {
  created: boolean;
  identifier: string;
  index: number;
  additionalData: Record<string, unknown>;
}

export interface PortBulkEntityFailedResult {
  identifier: string;
  index: number;
  statusCode: number;
  error: string;
  message: string;
}

export interface PortBulkEntitiesResponse {
  entities: PortBulkEntityResult[];
  ok: boolean;
  errors: PortBulkEntityFailedResult[];
}
