import { ApiClient, memorySessionStore } from '@/core/api';
import { isAppendOnlyTable, SYNC_TABLE_NAMES, type SyncTableName } from '@/shared';

// Test-only: an in-memory stand-in for apps/api, reached through `fetch`. It follows the same
// contract (envelopes, error codes, token rotation, device codes, per-shop cursors, append-only
// rules, paged pulls), so the mobile sync and account code can be tested end to end in Node.

interface StoredRecord {
  table: string;
  data: Record<string, unknown> & { id: string; shopId: string };
  deviceId: string;
  createdSeq: number;
  seq: number;
}

interface Account {
  userId: string;
  identifier: string;
  password: string;
  shopId: string;
  shop: Record<string, unknown>;
  recoveryCode: string;
}

export interface FakeApiOptions {
  /** Records per pull page (the real server uses 500); small values exercise paging. */
  pageSize?: number;
  /** Seconds an access token lives. */
  accessTtl?: number;
  now?: () => number;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown, status = 200) => json(status, { data });
const fail = (status: number, code: string, message = code, details?: unknown) =>
  json(status, { error: { code, message, details } });

export class FakeApi {
  readonly accounts: Account[] = [];
  /** Per shop: devices and their codes. */
  readonly devices = new Map<string, Map<string, string>>();
  private readonly records = new Map<string, Map<string, StoredRecord>>();
  private readonly seqs = new Map<string, number>();
  private readonly access = new Map<string, { userId: string; shopId: string; exp: number }>();
  private readonly refresh = new Map<string, { userId: string; shopId: string; used: boolean }>();
  private counter = 0;
  /** Every request, for assertions. */
  readonly calls: { method: string; path: string }[] = [];
  /** Called before a push is applied, e.g. to simulate an edit while the push is in flight. */
  beforePush: (() => Promise<void>) | null = null;
  /** When set, every request fails as if offline. */
  offline = false;

  private readonly pageSize: number;
  private readonly accessTtl: number;
  private readonly now: () => number;

  constructor(options: FakeApiOptions = {}) {
    this.pageSize = options.pageSize ?? 500;
    this.accessTtl = options.accessTtl ?? 900;
    this.now = options.now ?? Date.now;
  }

  /** A client for one phone, talking to this server. */
  client(): ApiClient {
    return new ApiClient({
      baseUrl: 'https://api.test',
      sessions: memorySessionStore(),
      fetch: (url, init) => this.handle(url, init),
      downloadBytes: () => Promise.reject(new Error('not used')),
      now: this.now,
    });
  }

  /** Stored version of a record, as another device would pull it. */
  record(shopId: string, table: SyncTableName, id: string) {
    return this.records.get(shopId)?.get(`${table}:${id}`)?.data;
  }

  /** All stored records of one table. */
  table(shopId: string, table: SyncTableName) {
    return [...(this.records.get(shopId)?.values() ?? [])]
      .filter((record) => record.table === table)
      .map((record) => record.data);
  }

  /** Stores a record as if another device had pushed it. */
  seed(shopId: string, table: SyncTableName, data: StoredRecord['data'], deviceId: string) {
    this.store(shopId, table, data, deviceId);
  }

  private store(shopId: string, table: string, data: StoredRecord['data'], deviceId: string) {
    const shopRecords = this.records.get(shopId) ?? new Map<string, StoredRecord>();
    this.records.set(shopId, shopRecords);
    const seq = (this.seqs.get(shopId) ?? 0) + 1;
    this.seqs.set(shopId, seq);
    const key = `${table}:${data.id}`;
    const existing = shopRecords.get(key);
    shopRecords.set(key, { table, data, deviceId, createdSeq: existing?.createdSeq ?? seq, seq });
  }

  private issueTokens(userId: string, shopId: string) {
    this.counter += 1;
    const accessToken = `access-${this.counter}`;
    const refreshToken = `refresh-${this.counter}`;
    this.access.set(accessToken, { userId, shopId, exp: this.now() + this.accessTtl * 1000 });
    this.refresh.set(refreshToken, { userId, shopId, used: false });
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    if (this.offline) throw new TypeError('Network request failed');
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    this.calls.push({ method, path });
    const body: Record<string, unknown> =
      typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const header = new Headers(init.headers).get('Authorization') ?? '';
    const auth = this.access.get(header.replace(/^Bearer /, ''));
    const authed = auth && auth.exp > this.now() ? auth : null;

    switch (`${method} ${path}`) {
      case 'POST /auth/register': {
        const identifier = String(body.identifier);
        const shop = body.shop as Record<string, unknown>;
        if (this.accounts.some((account) => account.identifier === identifier)) {
          return fail(409, 'IDENTIFIER_TAKEN');
        }
        if (this.accounts.some((account) => account.shopId === shop.id)) {
          return fail(409, 'CONFLICT');
        }
        const account: Account = {
          userId: `0192f0c0-0000-7000-8000-${String(this.accounts.length + 1).padStart(12, '0')}`,
          identifier,
          password: String(body.password),
          shopId: String(shop.id),
          shop,
          recoveryCode: 'ABCD-EFGH-JKMN-PQRS',
        };
        this.accounts.push(account);
        this.devices.set(account.shopId, new Map());
        return ok(
          {
            ...this.issueTokens(account.userId, account.shopId),
            userId: account.userId,
            shopId: account.shopId,
            recoveryCode: account.recoveryCode,
          },
          201,
        );
      }
      case 'POST /auth/login': {
        const account = this.accounts.find(
          (candidate) =>
            candidate.identifier === body.identifier && candidate.password === body.password,
        );
        if (!account) return fail(401, 'INVALID_CREDENTIALS');
        return ok(this.issueTokens(account.userId, account.shopId));
      }
      case 'POST /auth/refresh': {
        const stored = this.refresh.get(String(body.refreshToken));
        if (!stored || stored.used) return fail(401, 'INVALID_REFRESH_TOKEN');
        stored.used = true;
        return ok(this.issueTokens(stored.userId, stored.shopId));
      }
      case 'POST /auth/logout': {
        this.refresh.delete(String(body.refreshToken));
        return ok({ loggedOut: true });
      }
      case 'POST /auth/recover': {
        const account = this.accounts.find(
          (candidate) =>
            candidate.identifier === body.identifier &&
            candidate.recoveryCode === body.recoveryCode,
        );
        if (!account) return fail(401, 'INVALID_RECOVERY_CODE');
        account.password = String(body.newPassword);
        account.recoveryCode = 'NEWC-ODEN-EWCO-DENE';
        return ok({ recoveryCode: account.recoveryCode });
      }
    }

    if (!authed) return fail(401, 'UNAUTHORIZED');
    const { shopId } = authed;

    switch (`${method} ${path}`) {
      case 'GET /me': {
        const account = this.accounts.find((candidate) => candidate.userId === authed.userId);
        if (!account) return fail(401, 'UNAUTHORIZED');
        return ok({
          user: { id: account.userId, identifier: account.identifier, createdAt: 0 },
          shop: {
            id: account.shopId,
            name: String(account.shop.name),
            currencyCode: String(account.shop.currencyCode),
            defaultLanguage: String(account.shop.defaultLanguage),
            invoicePrefix: String(account.shop.invoicePrefix),
          },
        });
      }
      case 'POST /devices': {
        const devices = this.devices.get(shopId) ?? new Map<string, string>();
        this.devices.set(shopId, devices);
        const id = String(body.id);
        const code = devices.get(id) ?? String.fromCharCode(65 + devices.size);
        devices.set(id, code);
        return ok({ id, shopId, deviceCode: code, name: String(body.name), lastSyncAt: null });
      }
      case 'POST /sync/push':
        return this.push(shopId, body);
      case 'GET /sync/pull':
        return this.pull(shopId, Number(parsed.searchParams.get('cursor') ?? '0'));
    }
    return fail(404, 'NOT_FOUND');
  }

  private async push(shopId: string, body: Record<string, unknown>): Promise<Response> {
    if (this.beforePush) await this.beforePush();
    const deviceId = String(body.deviceId);
    if (!this.devices.get(shopId)?.has(deviceId)) return fail(403, 'FORBIDDEN');
    const lastPulled = Number(body.lastPulledCursor);
    const seqBefore = this.seqs.get(shopId) ?? 0;
    const changes = body.changes as Record<
      string,
      { created?: StoredRecord['data'][]; updated?: StoredRecord['data'][] }
    >;
    const writes: { table: string; data: StoredRecord['data'] }[] = [];
    for (const table of SYNC_TABLE_NAMES) {
      const entry = changes[table];
      if (!entry) continue;
      if (isAppendOnlyTable(table) && (entry.updated?.length ?? 0) > 0) {
        return fail(400, 'APPEND_ONLY_VIOLATION');
      }
      for (const data of [...(entry.created ?? []), ...(entry.updated ?? [])]) {
        if (data.shopId !== shopId) return fail(403, 'FORBIDDEN');
        const existing = this.records.get(shopId)?.get(`${table}:${data.id}`);
        const same = existing && JSON.stringify(existing.data) === JSON.stringify(data);
        if (same) continue;
        if (existing && isAppendOnlyTable(table)) return fail(400, 'APPEND_ONLY_VIOLATION');
        writes.push({ table, data });
      }
    }
    for (const write of writes) this.store(shopId, write.table, write.data, deviceId);
    const seq = this.seqs.get(shopId) ?? 0;
    return ok({
      applied: writes.length,
      conflicts: {},
      cursor: String(lastPulled >= seqBefore ? seq : lastPulled),
    });
  }

  private pull(shopId: string, cursor: number): Response {
    const all = [...(this.records.get(shopId)?.entries() ?? [])]
      .filter(([, record]) => record.seq > cursor)
      .sort(([, a], [, b]) => a.seq - b.seq);
    const page = all.slice(0, this.pageSize);
    const changes: Record<string, { created: unknown[]; updated: unknown[]; deleted: string[] }> =
      {};
    for (const [, record] of page) {
      const entry = (changes[record.table] ??= { created: [], updated: [], deleted: [] });
      (record.createdSeq > cursor ? entry.created : entry.updated).push(record.data);
      if (record.data.deletedAt != null) entry.deleted.push(record.data.id);
    }
    return ok({
      changes,
      cursor: String(page.at(-1)?.[1].seq ?? cursor),
      hasMore: all.length > page.length,
    });
  }
}
