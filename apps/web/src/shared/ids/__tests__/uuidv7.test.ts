import { createUuidV7Generator, isUuidV7, uuidV7Timestamp } from '../../index';

/** Deterministic byte source for tests. */
function sequenceBytes(start = 0): (length: number) => Uint8Array {
  let next = start;
  return (length) => Uint8Array.from({ length }, () => (next += 37) % 256);
}

describe('createUuidV7Generator', () => {
  it('produces RFC 9562 version 7 identifiers that embed the timestamp', () => {
    const now = Date.UTC(2026, 10, 12, 12, 0, 0);
    const id = createUuidV7Generator({ now: () => now, randomBytes: sequenceBytes() })();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuidV7(id)).toBe(true);
    expect(uuidV7Timestamp(id)).toBe(now);
  });

  it('is strictly increasing within one millisecond', () => {
    const uuid = createUuidV7Generator({
      now: () => 1_800_000_000_000,
      randomBytes: sequenceBytes(),
    });
    const ids = Array.from({ length: 5000 }, () => uuid());

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('stays increasing when the clock steps backwards', () => {
    const times = [5000, 4000, 3000, 6000];
    let call = 0;
    const uuid = createUuidV7Generator({
      now: () => times[Math.min(call++, times.length - 1)] ?? 0,
      randomBytes: sequenceBytes(),
    });
    const ids = [uuid(), uuid(), uuid(), uuid()];

    expect([...ids].sort()).toEqual(ids);
    expect(uuidV7Timestamp(ids[1] ?? '')).toBe(5000);
    expect(uuidV7Timestamp(ids[3] ?? '')).toBe(6000);
  });

  it('sorts by creation time across milliseconds', () => {
    let now = 1_800_000_000_000;
    const uuid = createUuidV7Generator({ now: () => (now += 1), randomBytes: sequenceBytes(9) });
    const ids = Array.from({ length: 200 }, () => uuid());
    expect([...ids].sort()).toEqual(ids);
  });

  it('uses the platform random source by default', () => {
    const uuid = createUuidV7Generator();
    const a = uuid();
    const b = uuid();
    expect(isUuidV7(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(Math.abs(uuidV7Timestamp(a) - Date.now())).toBeLessThan(5000);
  });
});

describe('isUuidV7', () => {
  it('rejects other UUID versions and malformed text', () => {
    expect(isUuidV7('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d')).toBe(false); // v1
    expect(isUuidV7('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(false); // v4
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(() => uuidV7Timestamp('not-a-uuid')).toThrow(RangeError);
  });
});
