import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { nextClientIp, type TestApp } from './test-app.js';

export interface TestAccount {
  identifier: string;
  password: string;
  userId: string;
  shopId: string;
  accessToken: string;
  refreshToken: string;
  recoveryCode: string;
}

let accountCounter = 0;

export interface RegisterBody {
  identifier: string;
  password: string;
  shop: {
    id: string;
    name: string;
    currencyCode: string;
    defaultLanguage: string;
    invoicePrefix: string;
  };
}

/** A valid registration body with a unique identifier and shop ID. */
export function registerBody(overrides: Partial<RegisterBody> = {}): RegisterBody {
  accountCounter += 1;
  return {
    identifier: `owner${accountCounter}-${randomUUID().slice(0, 8)}@example.com`,
    password: 'correct horse battery',
    shop: {
      id: randomUUID(),
      name: `Shop ${accountCounter}`,
      currencyCode: 'BDT',
      defaultLanguage: 'bn',
      invoicePrefix: 'RS',
    },
    ...overrides,
  };
}

/** POST under /api/v1 from a fresh client IP, so tests never share a rate-limit bucket. */
export function post(testApp: TestApp, path: string, body: object, accessToken?: string) {
  const call = request(testApp.server)
    .post(`/api/v1${path}`)
    .set('X-Forwarded-For', nextClientIp())
    .send(body);
  return accessToken ? call.set('Authorization', `Bearer ${accessToken}`) : call;
}

/** Registers a new account through the API and returns everything a test needs to act as it. */
export async function createAccount(
  testApp: TestApp,
  overrides: Partial<RegisterBody> = {},
): Promise<TestAccount> {
  const body = registerBody(overrides);
  const response = await post(testApp, '/auth/register', body);
  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const { data } = response.body as { data: Omit<TestAccount, 'identifier' | 'password'> };
  return { identifier: body.identifier, password: body.password, ...data };
}
