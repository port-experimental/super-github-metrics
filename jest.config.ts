import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        tsconfig: {
          strict: false,
          noImplicitAny: false,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          allowJs: true,
        },
        useESM: false,
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testTimeout: 30000,
  verbose: true,
  transformIgnorePatterns: [
    "node_modules/(?!(@octokit/rest|@octokit/core|@octokit/types|@octokit/request|@octokit/auth-token|@octokit/auth-app|@octokit/auth-oauth-app|@octokit/auth-oauth-user|@octokit/auth-oauth-device|@octokit/oauth-methods|@octokit/endpoint|@octokit/request-error|universal-user-agent)/)",
  ],
  extensionsToTreatAsEsm: [],
  moduleFileExtensions: ["ts", "js", "json"],
};

export default config;
