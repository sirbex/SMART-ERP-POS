/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'ES2022',
          lib: ['ES2022'],
        },
      },
    ],
  },
  testTimeout: 30000,
  testPathIgnorePatterns: [
    '/node_modules/',
    'src/tests/accounting-integrity\\.test\\.ts',
    'src/rbac/test\\.ts',
    'src/modules/inventory/stockCount\\.test\\.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
};
