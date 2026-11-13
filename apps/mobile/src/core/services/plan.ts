import { getValue, type Orm, useLiveQuery } from '@/core/db';
import { entitlementSchema, type Plan } from '@/shared';

import { SETTINGS } from './device';

// The shop's plan (Free or Pro). The server decides it after verifying a store purchase; the
// answer is cached in the encrypted database so the app keeps working offline
// (AGENTS.md §11: "Entitlement cached for offline use").

/**
 * Plan in effect at `now` for a cached entitlement. Anything missing, malformed or expired is
 * the free plan, so a problem here can never unlock paid features.
 */
export function resolvePlan(cachedJson: string | null, now: number): Plan {
  if (cachedJson === null) return 'FREE';
  let value: unknown;
  try {
    value = JSON.parse(cachedJson);
  } catch {
    return 'FREE';
  }
  const parsed = entitlementSchema.safeParse(value);
  if (!parsed.success || parsed.data.plan !== 'PRO') return 'FREE';
  const { expiresAt } = parsed.data;
  return expiresAt === null || expiresAt > now ? 'PRO' : 'FREE';
}

export async function getPlan(orm: Orm, now: number): Promise<Plan> {
  return resolvePlan(await getValue(orm, SETTINGS.entitlement), now);
}

/** The current plan, kept up to date. Free until a cached Pro entitlement is found. */
export function usePlan(now: () => number): Plan {
  const query = useLiveQuery('plan', ['kv'], (orm) => getPlan(orm, now()));
  return query.status === 'ready' ? query.data : 'FREE';
}
