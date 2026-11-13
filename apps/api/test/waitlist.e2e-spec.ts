import request from 'supertest';

import { createTestApp, nextClientIp, TEST_ORIGIN, type TestApp } from './support/test-app.js';

interface WaitlistRow {
  email: string | null;
  phone: string | null;
  name: string | null;
  locale: string;
  shop_type: string | null;
  source: string;
}

describe('POST /api/v1/waitlist (e2e)', () => {
  let testApp: TestApp;

  const join = (body: Record<string, unknown>, ip = nextClientIp()) =>
    request(testApp.server).post('/api/v1/waitlist').set('X-Forwarded-For', ip).send(body);

  const rows = (): Promise<WaitlistRow[]> =>
    testApp.dataSource.query(
      'SELECT email, phone, name, locale, shop_type, source FROM waitlist_entries ORDER BY created_at',
    );

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.dataSource.query('TRUNCATE waitlist_entries');
  });

  it('stores a signup and answers with the data envelope', async () => {
    const response = await join({
      email: '  Karim@Example.COM ',
      name: ' Karim Uddin ',
      locale: 'bn',
      shopType: 'grocery',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { joined: true } });
    expect(await rows()).toEqual([
      {
        email: 'karim@example.com',
        phone: null,
        name: 'Karim Uddin',
        locale: 'bn',
        shop_type: 'grocery',
        source: 'landing',
      },
    ]);
  });

  it('accepts a phone number without an email and normalizes its formatting', async () => {
    const response = await join({ phone: '+880 1712-345678', locale: 'en' });

    expect(response.status).toBe(201);
    expect(await rows()).toMatchObject([{ email: null, phone: '+8801712345678' }]);
  });

  it('treats empty optional form fields as not provided', async () => {
    const response = await join({
      email: 'rahim@example.com',
      phone: '',
      name: '',
      shopType: ' ',
      website: '',
      locale: 'en',
    });

    expect(response.status).toBe(201);
    expect(await rows()).toMatchObject([
      { email: 'rahim@example.com', phone: null, name: null, shop_type: null },
    ]);
  });

  it('answers a repeat signup like a new one and stores it once', async () => {
    const first = await join({ email: 'karim@example.com', locale: 'en' });
    const second = await join({ email: 'KARIM@example.com', locale: 'bn' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await rows()).toHaveLength(1);
  });

  it('stores concurrent duplicate signups exactly once', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => join({ phone: '01712345678', locale: 'bn' })),
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await rows()).toHaveLength(1);
  });

  it('rejects a signup with neither an email nor a phone number', async () => {
    const response = await join({ locale: 'en' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [
          { field: 'email', messages: expect.arrayContaining([expect.stringMatching(/email/i)]) },
        ],
      },
    });
    expect(await rows()).toHaveLength(0);
  });

  it.each([
    ['a malformed email', { email: 'not-an-email', locale: 'en' }, 'email'],
    ['a malformed phone number', { phone: '12ab', locale: 'en' }, 'phone'],
    ['an unsupported locale', { email: 'a@example.com', locale: 'fr' }, 'locale'],
    ['a missing locale', { email: 'a@example.com' }, 'locale'],
    ['an overlong name', { email: 'a@example.com', locale: 'en', name: 'x'.repeat(121) }, 'name'],
    ['an unknown property', { email: 'a@example.com', locale: 'en', isAdmin: true }, 'isAdmin'],
  ])('rejects %s', async (_case, body, field) => {
    const response = await join(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    expect(await rows()).toHaveLength(0);
  });

  it('pretends to accept honeypot submissions but stores nothing', async () => {
    const response = await join({
      email: 'bot@example.com',
      locale: 'en',
      website: 'http://spam.example',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { joined: true } });
    expect(await rows()).toHaveLength(0);
  });

  it('rate limits signups per client IP', async () => {
    const ip = nextClientIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await join({ email: `user${attempt}@example.com`, locale: 'en' }, ip);
      statuses.push(response.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);

    const blocked = await join({ email: 'late@example.com', locale: 'en' }, ip);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    const otherClient = await join({ email: 'other@example.com', locale: 'en' });
    expect(otherClient.status).toBe(201);
  });

  it('allows the landing site origin and no other', async () => {
    const allowed = await join({ email: 'cors@example.com', locale: 'en' }).set(
      'Origin',
      TEST_ORIGIN,
    );
    expect(allowed.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);

    const denied = await join({ email: 'cors2@example.com', locale: 'en' }).set(
      'Origin',
      'https://evil.example',
    );
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
