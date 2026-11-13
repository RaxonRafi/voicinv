import request from 'supertest';

import { appConfigSchema } from '../src/shared/index.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('GET /api/v1/app-config (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    process.env.MIN_APP_VERSION = '0.3.0';
    process.env.LATEST_APP_VERSION = '0.4.1';
    process.env.FEATURE_FLAGS = 'sync=true,cloudBackup=false';
    testApp = await createTestApp();
  });

  afterAll(async () => {
    delete process.env.MIN_APP_VERSION;
    delete process.env.LATEST_APP_VERSION;
    delete process.env.FEATURE_FLAGS;
    await testApp.close();
  });

  it('is public and returns the configured versions and feature flags', async () => {
    const response = await request(testApp.server).get('/api/v1/app-config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        minSupportedVersion: '0.3.0',
        latestVersion: '0.4.1',
        featureFlags: { sync: true, cloudBackup: false },
      },
    });
    expect(response.headers['cache-control']).toBe('public, max-age=300');
  });

  it('matches the contract the mobile app validates against', async () => {
    const response = await request(testApp.server).get('/api/v1/app-config');
    expect(appConfigSchema.safeParse(response.body.data).success).toBe(true);
  });
});
