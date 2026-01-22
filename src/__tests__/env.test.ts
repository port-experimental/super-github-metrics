import { getGithubEnv, getPortEnv } from "../env";

describe("env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("requires Port credentials", () => {
    delete process.env.PORT_CLIENT_ID;
    delete process.env.PORT_CLIENT_SECRET;

    expect(() => getPortEnv()).toThrow();
  });

  it("accepts Port credentials when present", () => {
    process.env.PORT_CLIENT_ID = "port-id";
    process.env.PORT_CLIENT_SECRET = "port-secret";

    expect(getPortEnv()).toEqual({
      portClientId: "port-id",
      portClientSecret: "port-secret",
    });
  });

  it("requires GitHub orgs", () => {
    delete process.env.X_GITHUB_ORGS;

    expect(() => getGithubEnv()).toThrow();
  });

  it("requires all GitHub app variables together", () => {
    process.env.X_GITHUB_ORGS = "org-a";
    process.env.X_GITHUB_APP_ID = "app-id";
    delete process.env.X_GITHUB_APP_PRIVATE_KEY;
    delete process.env.X_GITHUB_APP_INSTALLATION_ID;

    expect(() => getGithubEnv()).toThrow(
      "X_GITHUB_APP_ID, X_GITHUB_APP_PRIVATE_KEY, and X_GITHUB_APP_INSTALLATION_ID must be set together",
    );
  });

  it("accepts PAT tokens without GitHub app variables", () => {
    process.env.X_GITHUB_ORGS = "org-a,org-b";
    process.env.X_GITHUB_TOKEN = "token-1, token-2";
    delete process.env.X_GITHUB_ENTERPRISE;
    delete process.env.X_GITHUB_APP_ID;
    delete process.env.X_GITHUB_APP_PRIVATE_KEY;
    delete process.env.X_GITHUB_APP_INSTALLATION_ID;

    expect(getGithubEnv()).toEqual({
      appId: undefined,
      privateKey: undefined,
      installationId: undefined,
      enterpriseName: undefined,
      orgs: ["org-a", "org-b"],
      patTokens: ["token-1", "token-2"],
    });
  });

  it("accepts GitHub app variables together", () => {
    process.env.X_GITHUB_ORGS = "org-a";
    process.env.X_GITHUB_APP_ID = "app-id";
    process.env.X_GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.X_GITHUB_APP_INSTALLATION_ID = "install-id";
    delete process.env.X_GITHUB_ENTERPRISE;
    delete process.env.X_GITHUB_TOKEN;

    expect(getGithubEnv()).toEqual({
      appId: "app-id",
      privateKey: "private-key",
      installationId: "install-id",
      enterpriseName: undefined,
      orgs: ["org-a"],
      patTokens: undefined,
    });
  });
});
