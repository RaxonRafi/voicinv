import { setValue } from '@/core/db';
import { createTestApp } from '@/core/testing/harness';

import { SETTINGS } from '../device';
import { getPlan, resolvePlan } from '../plan';

const now = Date.UTC(2026, 10, 12);
const entitlement = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ plan: 'PRO', expiresAt: now + 86_400_000, checkedAt: now, ...overrides });

describe('resolvePlan', () => {
  it('is free when nothing is cached', () => {
    expect(resolvePlan(null, now)).toBe('FREE');
  });

  it('is Pro while a cached Pro entitlement has not expired, with no network needed', () => {
    expect(resolvePlan(entitlement(), now)).toBe('PRO');
    expect(resolvePlan(entitlement({ expiresAt: null }), now)).toBe('PRO');
  });

  it('falls back to free once the paid period has ended', () => {
    expect(resolvePlan(entitlement({ expiresAt: now }), now)).toBe('FREE');
    expect(resolvePlan(entitlement({ expiresAt: now - 1 }), now)).toBe('FREE');
  });

  it.each([
    ['not JSON', '{plan:'],
    ['a different shape', JSON.stringify({ pro: true })],
    ['an unknown plan', entitlement({ plan: 'ENTERPRISE' })],
    ['a free entitlement', entitlement({ plan: 'FREE', expiresAt: null })],
    ['a non-numeric expiry', entitlement({ expiresAt: 'never' })],
  ])('never unlocks paid features from %s', (_label, cached) => {
    expect(resolvePlan(cached, now)).toBe('FREE');
  });
});

describe('getPlan', () => {
  it('reads the cached entitlement from the encrypted database', async () => {
    const app = await createTestApp();
    expect(await getPlan(app.db.orm, now)).toBe('FREE');

    await app.db.write((tx) => setValue(tx, SETTINGS.entitlement, entitlement()));
    expect(await getPlan(app.db.orm, now)).toBe('PRO');
    expect(await getPlan(app.db.orm, now + 2 * 86_400_000)).toBe('FREE');
    await app.close();
  });
});
