import { cleanEnv, makeValidator, str } from 'envalid';

type ReporterOptions = {
  errors: Record<string, { message: string }>;
};

const throwReporter = ({ errors }: ReporterOptions) => {
  const errorEntries = Object.entries(errors);
  if (errorEntries.length === 0) {
    return;
  }

  const message = errorEntries.map(([key, error]) => `${key}: ${error.message}`).join(', ');
  throw new Error(`Invalid environment variables: ${message}`);
};

const commaSeparatedList = makeValidator((input: string) => {
  const value = input.trim();
  if (!value) {
    throw new Error('Must be a comma-separated list with at least one value');
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error('Must be a comma-separated list with at least one value');
  }

  return items;
});

const optionalString = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalList = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const items = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
};

export type PortEnv = {
  portClientId: string;
  portClientSecret: string;
  portBaseUrl: string;
};

export type GithubEnv = {
  appId?: string;
  privateKey?: string;
  installationId?: string;
  enterpriseName?: string;
  orgs: string[];
  patTokens?: string[];
  repos?: string[];
};

export type CoderEnv = {
  sessionToken: string;
  apiBaseUrl: string;
  organizationId: string;
};

export function getPortEnv(): PortEnv {
  const env = cleanEnv(
    process.env,
    {
      PORT_CLIENT_ID: str(),
      PORT_CLIENT_SECRET: str(),
      PORT_BASE_URL: str(),
    },
    { reporter: throwReporter }
  );

  return {
    portClientId: env.PORT_CLIENT_ID,
    portClientSecret: env.PORT_CLIENT_SECRET,
    portBaseUrl: env.PORT_BASE_URL,
  };
}

export function getGithubEnv(): GithubEnv {
  const env = cleanEnv(
    process.env,
    {
      X_GITHUB_ORGS: commaSeparatedList(),
      X_GITHUB_TOKEN: str({ default: '' }),
      X_GITHUB_APP_ID: str({ default: '' }),
      X_GITHUB_APP_PRIVATE_KEY: str({ default: '' }),
      X_GITHUB_APP_INSTALLATION_ID: str({ default: '' }),
      X_GITHUB_ENTERPRISE: str({ default: '' }),
      X_GITHUB_REPOS: str({ default: '' }),
    },
    { reporter: throwReporter }
  );

  const appId = optionalString(env.X_GITHUB_APP_ID);
  const privateKey = optionalString(env.X_GITHUB_APP_PRIVATE_KEY);
  const installationId = optionalString(env.X_GITHUB_APP_INSTALLATION_ID);
  const enterpriseName = optionalString(env.X_GITHUB_ENTERPRISE);
  const patTokens = parseOptionalList(env.X_GITHUB_TOKEN);
  const repos = parseOptionalList(env.X_GITHUB_REPOS);

  const appValues = [appId, privateKey, installationId];
  const hasAnyAppValue = appValues.some(Boolean);
  const hasAllAppValues = appValues.every(Boolean);

  if (hasAnyAppValue && !hasAllAppValues) {
    throw new Error(
      'X_GITHUB_APP_ID, X_GITHUB_APP_PRIVATE_KEY, and X_GITHUB_APP_INSTALLATION_ID must be set together'
    );
  }

  return {
    appId,
    privateKey,
    installationId,
    enterpriseName,
    orgs: env.X_GITHUB_ORGS,
    patTokens,
    repos,
  };
}

export function getCoderEnv(): CoderEnv {
  const env = cleanEnv(
    process.env,
    {
      CODER_SESSION_TOKEN: str(),
      CODER_API_BASE_URL: str(),
      CODER_ORGANIZATION_ID: str(),
    },
    { reporter: throwReporter }
  );

  return {
    sessionToken: env.CODER_SESSION_TOKEN,
    apiBaseUrl: env.CODER_API_BASE_URL,
    organizationId: env.CODER_ORGANIZATION_ID,
  };
}

export type PortBlueprintEnv = {
  serviceBlueprint: string;
  serviceMetricsBlueprint: string;
  repositoryRelationKey: string;
  repositoryRelationTarget: string;
};

export function getPortBlueprintEnv(): PortBlueprintEnv {
  const env = cleanEnv(
    process.env,
    {
      PORT_SERVICE_BLUEPRINT: str({ default: 'service' }),
      PORT_SERVICE_METRICS_BLUEPRINT: str({ default: 'serviceMetrics' }),
      // Configurable relation key and target for repository-related metrics
      // This allows using a different blueprint (e.g., 'githubRepository') instead of 'service'
      PORT_REPOSITORY_RELATION_KEY: str({ default: 'service' }),
      PORT_REPOSITORY_RELATION_TARGET: str({ default: 'service' }),
    },
    { reporter: throwReporter }
  );

  return {
    serviceBlueprint: env.PORT_SERVICE_BLUEPRINT,
    serviceMetricsBlueprint: env.PORT_SERVICE_METRICS_BLUEPRINT,
    repositoryRelationKey: env.PORT_REPOSITORY_RELATION_KEY,
    repositoryRelationTarget: env.PORT_REPOSITORY_RELATION_TARGET,
  };
}

/**
 * Get the relation key to use for repository-related entities (e.g., PR metrics, workflow metrics)
 * Defaults to 'service' but can be configured via PORT_REPOSITORY_RELATION_KEY
 */
export function getRepositoryRelationKey(): string {
  return getPortBlueprintEnv().repositoryRelationKey;
}

/**
 * Get the relation target blueprint for repository-related entities
 * Defaults to 'service' but can be configured via PORT_REPOSITORY_RELATION_TARGET
 * to use 'githubRepository' or another blueprint
 */
export function getRepositoryRelationTarget(): string {
  return getPortBlueprintEnv().repositoryRelationTarget;
}
