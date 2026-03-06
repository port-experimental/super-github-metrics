import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          strict: false,
          noImplicitAny: false,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
        useESM: false,
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  verbose: true,
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit/rest|@octokit/core|@octokit/types|@octokit/request|@octokit/auth-token|@octokit/auth-app|@octokit/auth-oauth-app|universal-user-agent)/)',
  ],
  extensionsToTreatAsEsm: [],
  globals: {
    'ts-jest': {
      useESM: false,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: ['/node_modules/'],
};

export default config;
