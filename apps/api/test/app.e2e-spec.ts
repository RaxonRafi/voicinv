import request from 'supertest';

import { createTestApp, type TestApp } from './support/test-app.js';

describe('API foundation (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /api/v1/health reports the API and database as up', async () => {
    const response = await request(testApp.server).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok', database: 'up' } });
  });

  it('sends security headers and hides the framework', async () => {
    const response = await request(testApp.server).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await request(testApp.server).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('serves routes only under the versioned prefix', async () => {
    const response = await request(testApp.server).get('/health');
    expect(response.status).toBe(404);
  });

  it('answers malformed JSON with a 400 envelope instead of a server error', async () => {
    const response = await request(testApp.server)
      .post('/api/v1/waitlist')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('serves the OpenAPI document outside production', async () => {
    const response = await request(testApp.server).get('/api/docs-json');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/waitlist',
        '/api/v1/health',
        '/api/v1/app-config',
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/auth/recover',
        '/api/v1/me',
        '/api/v1/devices',
      ]),
    );
  });
});
