import { z } from 'zod';

import { ApiClient, ApiError, CLIENT_ERROR, configuredBaseUrl, type FetchLike } from '../client';
import { memorySessionStore } from '../memory-session-store';

const NOW = 1_800_000_000_000;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(fetch: FetchLike, accessExpiresAt = NOW + 600_000) {
  const sessions = memorySessionStore({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessExpiresAt,
  });
  const client = new ApiClient({ baseUrl: 'https://api.test', sessions, fetch, now: () => NOW });
  return { client, sessions };
}

const thing = z.object({ value: z.number() });

describe('ApiClient', () => {
  it('sends the access token and returns the validated data', async () => {
    const fetch = jest.fn<Promise<Response>, Parameters<FetchLike>>(async () =>
      json(200, { data: { value: 1 } }),
    );
    const { client } = setup(fetch);

    await expect(
      client.request(thing, { method: 'GET', path: '/x', query: { a: 'b c' } }),
    ).resolves.toEqual({ value: 1 });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/api/v1/x?a=b%20c');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('turns the error envelope into an ApiError with the server code', async () => {
    const { client } = setup(async () =>
      json(409, { error: { code: 'IDENTIFIER_TAKEN', message: 'taken' } }),
    );
    await expect(client.request(thing, { method: 'POST', path: '/x' })).rejects.toMatchObject({
      code: 'IDENTIFIER_TAKEN',
      status: 409,
    });
  });

  it('reports a response that breaks the contract instead of passing it on', async () => {
    const { client } = setup(async () => json(200, { data: { value: 'not a number' } }));
    await expect(client.request(thing, { method: 'GET', path: '/x' })).rejects.toMatchObject({
      code: CLIENT_ERROR.BAD_RESPONSE,
    });
  });

  it('reports no connection as a retryable NETWORK error', async () => {
    const { client } = setup(async () => {
      throw new TypeError('Network request failed');
    });
    const error = await client.request(thing, { method: 'GET', path: '/x' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: CLIENT_ERROR.NETWORK, retryable: true });
  });

  it('refreshes an expiring token once, even for concurrent requests', async () => {
    const fetch = jest.fn<Promise<Response>, Parameters<FetchLike>>(async (url) =>
      url.endsWith('/auth/refresh')
        ? json(200, {
            data: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
          })
        : json(200, { data: { value: 2 } }),
    );
    const { client, sessions } = setup(fetch, NOW + 1000);

    await Promise.all([
      client.request(thing, { method: 'GET', path: '/a' }),
      client.request(thing, { method: 'GET', path: '/b' }),
    ]);

    const refreshes = fetch.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
    expect(await sessions.load()).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
  });

  it('refreshes and retries once when the server refuses the access token', async () => {
    let calls = 0;
    const { client } = setup(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        return json(200, { data: { accessToken: 'access-2', refreshToken: 'r2', expiresIn: 900 } });
      }
      calls += 1;
      return calls === 1
        ? json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } })
        : json(200, { data: { value: 3 } });
    });
    await expect(client.request(thing, { method: 'GET', path: '/x' })).resolves.toEqual({
      value: 3,
    });
  });

  it('forgets the session when the refresh token is no longer valid', async () => {
    const { client, sessions } = setup(
      async () => json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'ended' } }),
      NOW - 1,
    );
    await expect(client.request(thing, { method: 'GET', path: '/x' })).rejects.toMatchObject({
      code: CLIENT_ERROR.SIGNED_OUT,
    });
    expect(await sessions.load()).toBeNull();
  });

  it('signs out locally even when the server cannot be reached', async () => {
    const { client, sessions } = setup(async () => {
      throw new TypeError('offline');
    });
    await client.endSession();
    expect(await sessions.load()).toBeNull();
  });

  it('refuses to make requests when no server is configured', async () => {
    const client = new ApiClient({ baseUrl: null, sessions: memorySessionStore() });
    expect(client.configured).toBe(false);
    await expect(
      client.request(thing, { method: 'GET', path: '/x', auth: false }),
    ).rejects.toMatchObject({ code: CLIENT_ERROR.NOT_CONFIGURED });
  });
});

describe('configuredBaseUrl', () => {
  it('accepts http(s) URLs and drops trailing slashes', () => {
    expect(configuredBaseUrl(' https://api.example.com/ ')).toBe('https://api.example.com');
    expect(configuredBaseUrl('http://10.0.2.2:4000')).toBe('http://10.0.2.2:4000');
  });

  it('treats a missing or malformed value as "no server"', () => {
    expect(configuredBaseUrl(undefined)).toBeNull();
    expect(configuredBaseUrl('')).toBeNull();
    expect(configuredBaseUrl('api.example.com')).toBeNull();
  });
});
