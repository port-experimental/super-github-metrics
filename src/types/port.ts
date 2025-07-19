export interface OAuthResponse {
  accessToken: string;
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
