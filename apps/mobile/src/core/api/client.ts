import { type z } from 'zod';

import { apiErrorSchema, authTokensSchema, type AuthTokens } from '@/shared';

// Client for our own backend (AGENTS.md §1 rule 3), used only by the optional account features:
// sign-in, sync and cloud backup. Nothing in the core loop calls it. Every response is checked
// against the shared Zod contracts; anything unexpected becomes an ApiError, never a crash.

/** Error codes added by the client to the server's own (`INVALID_CREDENTIALS`, …). */
export const CLIENT_ERROR = {
  /** No API URL was configured for this build. */
  NOT_CONFIGURED: 'NOT_CONFIGURED',
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

/** Where the session is kept (the platform keystore on the device). */
export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
/** Downloads a URL to bytes. On the device this goes through the native downloader. */
export type DownloadBytes = (url: string, headers: Record<string, string>) => Promise<Uint8Array>;

export interface ApiClientOptions {
  /** e.g. `https://api.example.com`; null when the build has no API configured. */
  baseUrl: string | null;
  sessions: SessionStore;
  fetch?: FetchLike;
  downloadBytes?: DownloadBytes;
  now?: () => number;
  /** Per-request time limit in ms. */
  timeoutMs?: number;
}

export interface ApiRequest {
  method: 'GET' | 'POST';
  /** Path below `/api/v1`, e.g. `/sync/pull`. */
  path: string;
  query?: Record<string, string | undefined>;
  /** JSON body. */
  json?: unknown;
  /** Raw body, sent as application/octet-stream. */
  bytes?: Uint8Array;
  /** Send the access token (default true). */
  auth?: boolean;
}

const API_PREFIX = '/api/v1';
/** Refresh a little before expiry, so a token never runs out mid-request. */
const EXPIRY_MARGIN_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly downloadImpl: DownloadBytes;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private refreshing: Promise<Session> | null = null;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.downloadImpl = options.downloadBytes ?? ((url, headers) => this.fetchBytes(url, headers));
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Whether this build can reach an API at all. */
  get configured(): boolean {
    return this.options.baseUrl !== null;
  }

  async hasSession(): Promise<boolean> {
    return (await this.options.sessions.load()) !== null;
  }

  /** Stores the tokens returned by register, login or refresh. */
  async startSession(tokens: AuthTokens): Promise<void> {
    await this.options.sessions.save(this.toSession(tokens));
  }

  /** Revokes the refresh token on the server when possible, and always forgets the session. */
  async endSession(): Promise<void> {
    const session = await this.options.sessions.load();
    await this.options.sessions.clear();
    if (!session || !this.configured) return;
    try {
      await this.send({
        method: 'POST',
        path: '/auth/logout',
        json: { refreshToken: session.refreshToken },
        auth: false,
      });
    } catch {
      // Offline or already revoked: the token expires on its own; the device forgot it.
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

  /** Downloads a binary resource (an encrypted backup) with the access token. */
  async download(path: string): Promise<Uint8Array> {
    const url = this.url(path);
    const session = await this.validSession();
    try {
      return await this.downloadImpl(url, { Authorization: `Bearer ${session.accessToken}` });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(CLIENT_ERROR.NETWORK, 0, 'Could not download the file.');
    }
  }

  private async send(request: ApiRequest, retried = false): Promise<unknown> {
    const auth = request.auth ?? true;
    const session = auth ? await this.validSession() : null;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    let body: RequestInit['body'];
    if (request.bytes) {
      headers['Content-Type'] = 'application/octet-stream';
      // An exact ArrayBuffer copy: React Native's fetch sends ArrayBuffers, not views.
      body = request.bytes.slice().buffer;
    } else if (request.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(request.json);
    }

    const response = await this.fetchWithTimeout(this.url(request.path, request.query), {
      method: request.method,
      headers,
      body,
    });
    const payload = await response.json().catch(() => undefined);

    if (response.ok) {
      if (typeof payload === 'object' && payload !== null && 'data' in payload) {
        return payload.data;
      }
      throw new ApiError(CLIENT_ERROR.BAD_RESPONSE, response.status, 'Unexpected response.');
    }
    // The access token was refused (for example the server restarted with a new secret):
    // refresh once and try again.
    if (response.status === 401 && auth && !retried) {
      await this.refresh(true);
      return this.send(request, true);
    }
    throw this.errorFrom(response.status, payload);
  }

  /** A session whose access token is still valid, refreshing it first when needed. */
  private async validSession(): Promise<Session> {
    const session = await this.options.sessions.load();
    if (!session) throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Sign in to continue.');
    if (session.accessExpiresAt - EXPIRY_MARGIN_MS > this.now()) return session;
    return this.refresh(false);
  }

  /** One refresh at a time; concurrent callers share it (a refresh token works only once). */
  private refresh(force: boolean): Promise<Session> {
    this.refreshing ??= this.doRefresh(force).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(force: boolean): Promise<Session> {
    const current = await this.options.sessions.load();
    if (!current) throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Sign in to continue.');
    if (!force && current.accessExpiresAt - EXPIRY_MARGIN_MS > this.now()) return current;

    const response = await this.fetchWithTimeout(this.url('/auth/refresh'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = this.errorFrom(response.status, payload);
      if (response.status === 401) {
        // The session is over (revoked, expired or reused elsewhere): forget it.
        await this.options.sessions.clear();
        throw new ApiError(CLIENT_ERROR.SIGNED_OUT, 401, 'Your session has ended.');
      }
      throw error;
    }
    const data =
      typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'data') : null;
    const tokens = authTokensSchema.safeParse(data);
    if (!tokens.success) {
      throw new ApiError(CLIENT_ERROR.BAD_RESPONSE, response.status, 'Unexpected response.');
    }
    const session = this.toSession(tokens.data);
    await this.options.sessions.save(session);
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
    const { baseUrl } = this.options;
    if (baseUrl === null) {
      throw new ApiError(CLIENT_ERROR.NOT_CONFIGURED, 0, 'No server is configured.');
    }
    const search = Object.entries(query)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${baseUrl}${API_PREFIX}${path}${search ? `?${search}` : ''}`;
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

  private async fetchBytes(url: string, headers: Record<string, string>): Promise<Uint8Array> {
    const response = await this.fetchWithTimeout(url, { method: 'GET', headers });
    if (!response.ok) {
      throw this.errorFrom(response.status, await response.json().catch(() => undefined));
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private errorFrom(status: number, payload: unknown): ApiError {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      return new ApiError(code, status, message, details);
    }
    return new ApiError(
      status === 0 ? CLIENT_ERROR.NETWORK : 'HTTP_ERROR',
      status,
      `HTTP ${status}`,
    );
  }
}

/** The API base URL baked into this build, or null when there is none. */
export function configuredBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '') ?? '';
  return /^https?:\/\/[^\s/]+/.test(trimmed) ? trimmed : null;
}
