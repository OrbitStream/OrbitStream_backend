import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  // Default: run all specs (unit + integration together)
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!main.ts',
    '!index.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/*.constants.ts',
    '!db/schema.ts',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: { lines: 0, functions: 0, branches: 0 },
    './auth/**/*.ts': { lines: 80, functions: 80, branches: 80 },
    './checkout/**/*.ts': { lines: 80, functions: 80, branches: 80 },
    './payments/**/*.ts': { lines: 80, functions: 80, branches: 80 },
  },
  testEnvironment: 'node',
  setupFiles: ['../jest-setup.ts'],
};

export default config;
