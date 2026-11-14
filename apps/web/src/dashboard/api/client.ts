import { type z } from 'zod';

import { apiErrorSchema, type AuthTokens, authTokensSchema } from '@/domain';

// Client for our own backend, the only server the web app talks to (AGENTS.md §1 rule 3).
// Every response is checked against the Zod contracts; anything unexpected becomes an ApiError,
// never a crash.

/** Error codes added by the client to the server's own (`INVALID_CREDENTIALS`, …). */
export const CLIENT_ERROR = {
  /** No connection, DNS failure, timeout. Worth retrying later. */
  NETWORK: 'NETWORK',
  /** The server answered with something that does not match the contract. */
  BAD_RESPONSE: 'BAD_RESPONSE',
  /** There is no session, or it ended (refresh token revoked or expired). */
  SIGNED_OUT: 'SIGNED_OUT',
} as const;

export class ApiError extends Error {
  constructor(
    /** Server error code, or one of CLIENT_ERROR. */
    readonly code: string,
    /** HTTP status; 0 when no response arrived. */
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when trying again later may work (offline, timeout, server trouble, rate limit). */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Tokens of the signed-in account. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms after which the access token must not be used. */
  accessExpiresAt: number;
}

/** Where the session is kept (the browser's storage for this site). */
export interface SessionStore {
  load(): Session | null;
  save(session: Session): void;
  clear(): void;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Runs `work` while no other tab of this browser runs it. A refresh token works only once,
 * so two tabs must never exchange the same one at the same moment.
 */
export type RunExclusive = <T>(work: () => Promise<T>) => Promise<T>;

export interface ApiClientOptions {
  /** e.g. `https://api.example.com`, without a trailing slash. */
  baseUrl: string;
  sessions: SessionStore;
  fetch?: FetchLike;
  now?: () => number;
  /** Per-request time limit in ms. */
  timeoutMs?: number;
  exclusive?: RunExclusive;
}

export interface ApiRequest {
  method: 'GET' | 'POST';
  /** Path below `/api/v1`, e.g. `/sync/pull`. */
  path: string;
  query?: Record<string, string | undefined>;
  /** JSON body. */
  json?: unknown;
  /** Send the access token (default true). */
  auth?: boolean;
}

const API_PREFIX = '/api/v1';
/** Refresh a little before expiry, so a token never runs out mid-request. */
const EXPIRY_MARGIN_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly exclusive: RunExclusive;
  private refreshing: Promise<Session> | null = null;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.exclusive = options.exclusive ?? ((work) => work());
  }

  hasSession(): boolean {
    return this.options.sessions.load() !== null;
  }

  /** Stores the tokens returned by register or login. */
  startSession(tokens: AuthTokens): void {
    this.options.sessions.save(this.toSession(tokens));
  }

  /** Revokes the refresh token on the server when possible, and always forgets the session. */
  async endSession(): Promise<void> {
    const session = this.options.sessions.load();
    this.options.sessions.clear();
    if (!session) return;
    try {
      await this.send({
        method: 'POST',
        path: '/auth/logout',
        json: { refreshToken: session.refreshToken },
        auth: false,
      });
    } catch {
      // Offline or already revoked: the token expires on its own; the browser forgot it.
    }
  }

  /** Sends a request and returns its `data`, validated against `schema`. */
  async request<S extends z.ZodType>(schema: S, request: ApiRequest): Promise<z.output<S>> {
    const body = await this.send(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(CLIENT_ERROR.BAD_RESPONSE, 200, 'Unexpected response from the server.');
    }
    return parsed.data;
  }

  private async send(request: ApiRequest, retried = false): Promise<unknown> {
    const auth = request.auth ?? true;
    const session = auth ? await this.validSession() : null;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    let body: string | undefined;
    if (request.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(request.json);
    }

    const response = await this.fetchWithTimeout(this.url(request.path, request.query), {
      method: request.method,
      headers,
      body,
    });
    const payload: unknown = await response.json().catch(() => undefined);

    if (response.ok) {
      if (typeof payload === 'object' && payload !== null && 'data' in payload) {
        return payload.data;
      }
      throw new ApiError(CLIENT_ERROR.BAD_RESPONSE, response.status, 'Unexpected response.');
    }
    // The access token was refused (for example the server restarted with a new secret):
    // refresh once and try again.
    if (response.status === 401 && session && !retried) {
      await this.refresh(session.accessToken);
      return this.send(request, true);
    }
    throw this.errorFrom(response.status, payload);
  }

  /** A session whose access token is still valid, refreshing it first when needed. */
  private async validSession(): Promise<Session> {
    const session = this.options.sessions.load();
    if (!session) throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Sign in to continue.');
    if (session.accessExpiresAt - EXPIRY_MARGIN_MS > this.now()) return session;
    return this.refresh(null);
  }

  /**
   * One refresh at a time in this tab; `exclusive` extends that across tabs. `refusedToken` is
   * the access token the server just rejected, if that is why a refresh is wanted.
   */
  private refresh(refusedToken: string | null): Promise<Session> {
    this.refreshing ??= this.exclusive(() => this.doRefresh(refusedToken)).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(refusedToken: string | null): Promise<Session> {
    const current = this.options.sessions.load();
    if (!current) throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Sign in to continue.');
    // Another tab may have refreshed while this one waited for its turn.
    const stillFresh = current.accessExpiresAt - EXPIRY_MARGIN_MS > this.now();
    if (stillFresh && current.accessToken !== refusedToken) return current;

    const response = await this.fetchWithTimeout(this.url('/auth/refresh'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      if (response.status === 401) {
        // The session is over (revoked, expired or reused elsewhere): forget it.
        this.options.sessions.clear();
        throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Your session has ended.');
      }
      throw this.errorFrom(response.status, payload);
    }
    const data: unknown =
      typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'data') : null;
    const tokens = authTokensSchema.safeParse(data);
    if (!tokens.success) {
      throw new ApiError(CLIENT_ERROR.BAD_RESPONSE, response.status, 'Unexpected response.');
    }
    const session = this.toSession(tokens.data);
    this.options.sessions.save(session);
    return session;
  }

  private toSession(tokens: AuthTokens): Session {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: this.now() + tokens.expiresIn * 1000,
    };
  }

  private url(path: string, query: Record<string, string | undefined> = {}): string {
    const search = Object.entries(query)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${this.options.baseUrl}${API_PREFIX}${path}${search ? `?${search}` : ''}`;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      throw new ApiError(CLIENT_ERROR.NETWORK, 0, 'Could not reach the server.');
    } finally {
      clearTimeout(timer);
    }
  }

  private errorFrom(status: number, payload: unknown): ApiError {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      return new ApiError(code, status, message, details);
    }
    return new ApiError('HTTP_ERROR', status, `HTTP ${status}`);
  }
}
