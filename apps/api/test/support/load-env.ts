// Vitest setup file: makes TEST_DATABASE_URL from apps/api/.env available to e2e tests.
// Variables already present in the environment (e.g. in CI) take precedence.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
