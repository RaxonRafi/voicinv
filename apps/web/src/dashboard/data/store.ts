import {
  authTokensSchema,
  countSyncRecords,
  deviceResponseSchema,
  formatInvoiceNumber,
  INITIAL_SYNC_CURSOR,
  type LanguageCode,
  type MeResponse,
  meResponseSchema,
  recoverResponseSchema,
  registerResponseSchema,
  SYNC_PUSH_MAX_RECORDS,
  SYNC_TABLE_NAMES,
  type SyncChanges,
  syncChangesSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
} from '@/domain';

import { SESSION_KEY, type KeyValueStorage } from '../api/browser';
import { type ApiClient, ApiError, CLIENT_ERROR } from '../api/client';
import { getShop, highestInvoiceSequence } from './selectors';
import {
  newShopIdentity,
  type NewShopInput,
  type ShopType,
  shopRecord,
  starterProducts,
} from './shop';
import {
  applyChanges,
  ChangeSet,
  DomainError,
  emptyShopData,
  type ShopData,
  type WriteContext,
} from './shop-data';

// The web app's connection to the shop's records (AGENTS.md M12b): signed in and online only.
//
// - On sign-in the browser registers as a device of the shop (platform `web`), which gives it
//   its own invoice-number code, then pulls every record into memory.
// - A change is built by a pure use case, pushed to the server in one transaction and only
//   then shown: the server stays the source of truth, nothing is queued in the browser.
// - Changes made on phones arrive with the next pull (on focus, on a timer, before each save).

export type Phase =
  /** Not started yet (before the first render in the browser). */
  | 'starting'
  | 'signedOut'
  /** Signed in; the records are being fetched. */
  | 'loading'
  | 'ready'
  /** Signed in, but the records could not be fetched. `errorCode` says why. */
  | 'failed';

export interface DashboardState {
  phase: Phase;
  data: ShopData;
  /** Phone number or email of the signed-in account. */
  identifier: string | null;
  shopId: string | null;
  /** This browser as a device of the shop. */
  device: { id: string; code: string } | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  /** Error code of the last failed load or background sync; null once one succeeds. */
  errorCode: string | null;
}

/** What a use case receives when it runs inside `commit`. */
export interface CommitContext extends WriteContext {
  /** Takes the next invoice number of this browser's own sequence (AGENTS.md §8.4). */
  nextInvoiceNumber(data: ShopData): string;
}

export interface Credentials {
  identifier: string;
  password: string;
}

export interface StoreDeps {
  api: ApiClient;
  storage: KeyValueStorage;
  now: () => number;
  newId: () => string;
  /** Name this browser registers under, e.g. "Web browser". */
  deviceName: string;
  /** Waits before a push is retried. Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

/** Guards against a server that keeps saying `hasMore`. */
const MAX_PULL_PAGES = 1000;
/** Extra attempts for a push whose answer never arrived. Re-sending is a no-op on the server. */
const PUSH_RETRIES = 2;

const INITIAL_STATE: DashboardState = {
  phase: 'starting',
  data: emptyShopData(),
  identifier: null,
  shopId: null,
  device: null,
  syncing: false,
  lastSyncedAt: null,
  errorCode: null,
};

function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'UNKNOWN';
}

/** Splits a change set into pushes of at most `SYNC_PUSH_MAX_RECORDS`, parents first. */
export function splitChanges(changes: SyncChanges, limit = SYNC_PUSH_MAX_RECORDS): SyncChanges[] {
  if (countSyncRecords(changes) <= limit) return [changes];
  const batches: SyncChanges[] = [];
  let current: Record<string, { created: unknown[]; updated: unknown[]; deleted: string[] }> = {};
  let size = 0;
  for (const table of SYNC_TABLE_NAMES) {
    const entry = changes[table];
    if (!entry) continue;
    for (const kind of ['created', 'updated'] as const) {
      for (const record of entry[kind]) {
        if (size === limit) {
          batches.push(current as SyncChanges);
          current = {};
          size = 0;
        }
        (current[table] ??= { created: [], updated: [], deleted: [] })[kind].push(record);
        size += 1;
      }
    }
  }
  if (size > 0) batches.push(current as SyncChanges);
  return batches;
}

export class DashboardStore {
  private state: DashboardState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private cursor: string = INITIAL_SYNC_CURSOR;
  /** Loads, pulls and pushes run one after another, never interleaved. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Starter products chosen at sign-up, kept until the shop record has been created. */
  private starter: { shopType: ShopType; language: LanguageCode } | null = null;

  constructor(private readonly deps: StoreDeps) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): DashboardState => this.state;

  /** Called once in the browser: resumes a stored session, or reports that there is none. */
  start(): Promise<void> {
    if (this.state.phase !== 'starting') return Promise.resolve();
    if (!this.deps.api.hasSession()) {
      this.set({ phase: 'signedOut' });
      return Promise.resolve();
    }
    return this.reload();
  }

  /** Fetches everything again after a failed load. */
  reload(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.load();
      } catch (error) {
        if (this.state.phase !== 'signedOut')
          this.set({ phase: 'failed', errorCode: errorCode(error) });
      }
    });
  }

  signIn(credentials: Credentials): Promise<void> {
    return this.enqueue(async () => {
      const tokens = await this.deps.api.request(authTokensSchema, {
        method: 'POST',
        path: '/auth/login',
        auth: false,
        json: credentials,
      });
      this.deps.api.startSession(tokens);
      try {
        await this.load();
      } catch (error) {
        // The half-made session is dropped again, so the next attempt starts clean.
        await this.deps.api.endSession();
        this.reset('signedOut');
        throw error;
      }
    });
  }

  /**
   * Creates an account and its shop. Returns the one-time recovery code, which must be shown
   * even when fetching the new (empty) shop fails afterwards; the store is then `failed` and
   * `reload` finishes the job.
   */
  createAccount(input: Credentials & NewShopInput): Promise<{ recoveryCode: string }> {
    return this.enqueue(async () => {
      const response = await this.deps.api.request(registerResponseSchema, {
        method: 'POST',
        path: '/auth/register',
        auth: false,
        json: {
          identifier: input.identifier,
          password: input.password,
          shop: newShopIdentity(this.deps.newId(), input),
        },
      });
      this.deps.api.startSession(response);
      this.starter = { shopType: input.shopType, language: input.language };
      try {
        await this.load();
      } catch (error) {
        if (this.state.phase !== 'signedOut')
          this.set({ phase: 'failed', errorCode: errorCode(error) });
      }
      return { recoveryCode: response.recoveryCode };
    });
  }

  /** Sets a new password with the recovery code. Returns the new code to write down. */
  recoverPassword(input: {
    identifier: string;
    recoveryCode: string;
    newPassword: string;
  }): Promise<{ recoveryCode: string }> {
    return this.deps.api.request(recoverResponseSchema, {
      method: 'POST',
      path: '/auth/recover',
      auth: false,
      json: input,
    });
  }

  /** Signs out: the records leave this browser's memory; they stay on the server. */
  async signOut(): Promise<void> {
    this.reset('signedOut');
    await this.deps.api.endSession();
  }

  /** Another tab changed the stored session (signed out, or signed in). */
  sessionChanged(key: string | null): void {
    if (key !== null && key !== SESSION_KEY) return;
    if (!this.deps.api.hasSession() && this.state.phase !== 'starting') this.reset('signedOut');
  }

  /** Fetches what changed on other devices. Never throws: problems land in `errorCode`. */
  sync(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.phase !== 'ready') return;
      this.set({ syncing: true });
      try {
        await this.pull();
        this.set({ syncing: false, errorCode: null });
      } catch (error) {
        this.set({ syncing: false });
        this.fail(error);
      }
    });
  }

  /**
   * Runs a use case against the latest records and saves what it returns. The records on
   * screen change only after the server has stored them. Throws `DomainError` for broken
   * business rules and `ApiError` when the server cannot be reached or refuses.
   */
  commit<T>(
    build: (data: ShopData, ctx: CommitContext) => { changes: ChangeSet; result: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const ctx = this.writeContext();
      try {
        // Decide on fresh data: duplicate checks and invoice numbers depend on it.
        await this.pull();
        let sequence: number | null = null;
        const { changes, result } = build(this.state.data, {
          ...ctx,
          nextInvoiceNumber: (data) => {
            const shop = getShop(data);
            const device = this.state.device;
            if (!shop || !device) throw new DomainError('noShop');
            sequence =
              Math.max(
                this.storedSequence(ctx),
                highestInvoiceSequence(data, shop.invoicePrefix, device.code),
              ) + 1;
            return formatInvoiceNumber({
              shopPrefix: shop.invoicePrefix,
              deviceCode: device.code,
              sequence,
            });
          },
        });
        if (changes.size > 0) await this.push(changes.build());
        // The sequence only ever moves forward, so a number is never reused.
        if (sequence !== null) this.deps.storage.setItem(this.sequenceKey(ctx), String(sequence));
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.code === CLIENT_ERROR.SIGNED_OUT) {
          this.reset('signedOut');
        }
        throw error;
      }
    });
  }

  /** Saves records that already exist as data (a backup being restored), in several pushes. */
  pushRecords(changes: SyncChanges): Promise<number> {
    return this.enqueue(async () => {
      this.writeContext();
      await this.pull();
      let applied = 0;
      for (const batch of splitChanges(changes)) applied += await this.push(batch);
      return applied;
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private set(patch: Partial<DashboardState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private reset(phase: 'signedOut'): void {
    this.cursor = INITIAL_SYNC_CURSOR;
    this.starter = null;
    this.set({ ...INITIAL_STATE, phase });
  }

  /** Records a background failure; a finished session sends the user back to sign-in. */
  private fail(error: unknown): void {
    if (error instanceof ApiError && error.code === CLIENT_ERROR.SIGNED_OUT) {
      this.reset('signedOut');
      return;
    }
    this.set({ errorCode: errorCode(error) });
  }

  private writeContext(): WriteContext {
    const { shopId, device, phase } = this.state;
    if (phase !== 'ready' || shopId === null || device === null) {
      throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Sign in to continue.');
    }
    return { shopId, deviceId: device.id, now: this.deps.now, newId: this.deps.newId };
  }

  private sequenceKey(ctx: WriteContext): string {
    return `vl.invoiceSequence.${ctx.shopId}.${ctx.deviceId}`;
  }

  private storedSequence(ctx: WriteContext): number {
    const value = Number(this.deps.storage.getItem(this.sequenceKey(ctx)));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  /** This browser's device ID for a shop: made once, then kept, so its code stays the same. */
  private deviceId(shopId: string): string {
    const key = `vl.device.${shopId}`;
    const stored = this.deps.storage.getItem(key);
    if (stored !== null && /^[0-9a-f-]{36}$/.test(stored)) return stored;
    const id = this.deps.newId();
    this.deps.storage.setItem(key, id);
    return id;
  }

  private async load(): Promise<void> {
    const { api } = this.deps;
    this.set({ phase: 'loading', errorCode: null });
    try {
      const me = await api.request(meResponseSchema, { method: 'GET', path: '/me' });
      const device = await api.request(deviceResponseSchema, {
        method: 'POST',
        path: '/devices',
        json: { id: this.deviceId(me.shop.id), name: this.deps.deviceName, platform: 'web' },
      });
      this.cursor = INITIAL_SYNC_CURSOR;
      this.set({
        data: emptyShopData(),
        identifier: me.user.identifier,
        shopId: me.shop.id,
        device: { id: device.id, code: device.deviceCode },
      });
      await this.pull();
      await this.ensureShopRecord(me);
      this.set({ phase: 'ready' });
    } catch (error) {
      if (error instanceof ApiError && error.code === CLIENT_ERROR.SIGNED_OUT) {
        this.reset('signedOut');
      }
      throw error;
    }
  }

  /**
   * An account created on the web has no synced shop record yet (a phone sends its own). The
   * first load creates it, with the starter products chosen at sign-up.
   */
  private async ensureShopRecord(me: MeResponse): Promise<void> {
    const { device } = this.state;
    if (getShop(this.state.data) || !device) return;
    const ctx: WriteContext = {
      shopId: me.shop.id,
      deviceId: device.id,
      now: this.deps.now,
      newId: this.deps.newId,
    };
    const changes = this.starter
      ? starterProducts(ctx, this.starter.shopType, this.starter.language)
      : new ChangeSet();
    changes.put('shops', shopRecord(ctx, me.shop));
    await this.push(changes.build());
    this.starter = null;
  }

  private async pull(): Promise<void> {
    const { shopId } = this.state;
    if (shopId === null) return;
    let data = this.state.data;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const response = await this.deps.api.request(syncPullResponseSchema, {
        method: 'GET',
        path: '/sync/pull',
        query: { cursor: this.cursor },
      });
      data = applyChanges(data, response.changes, shopId);
      this.cursor = response.cursor;
      if (!response.hasMore) break;
    }
    this.set({ data, lastSyncedAt: this.deps.now() });
  }

  /** Sends one change set; on success the records become part of what the screens show. */
  private async push(changes: SyncChanges): Promise<number> {
    const { shopId, device } = this.state;
    if (shopId === null || device === null) {
      throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Sign in to continue.');
    }
    // A record that does not fit the contract is a bug here; it must never reach the server.
    const checked = syncChangesSchema.safeParse(changes);
    if (!checked.success) throw new DomainError('invalid');

    const send = () =>
      this.deps.api.request(syncPushResponseSchema, {
        method: 'POST',
        path: '/sync/push',
        json: { deviceId: device.id, lastPulledCursor: this.cursor, changes: checked.data },
      });
    let response: Awaited<ReturnType<typeof send>> | undefined;
    for (let attempt = 0; response === undefined; attempt += 1) {
      try {
        response = await send();
      } catch (error) {
        // No answer arrived: the server may or may not have stored the push. Sending the same
        // records again is a no-op there, so retrying can never create a second invoice.
        const noAnswer = error instanceof ApiError && error.status === 0;
        if (!noAnswer || attempt >= PUSH_RETRIES) throw error;
        await (this.deps.sleep ?? defaultSleep)(500 * (attempt + 1));
      }
    }

    let data = applyChanges(this.state.data, checked.data, shopId);
    // Versions the server kept instead of ours (a cancelled invoice is never revived).
    data = applyChanges(data, response.conflicts, shopId);
    this.cursor = response.cursor;
    this.set({ data, lastSyncedAt: this.deps.now(), errorCode: null });
    return response.applied;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
