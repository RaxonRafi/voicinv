// Public API of the backend client. Only optional account features use it (AGENTS.md §1).
export {
  ApiClient,
  type ApiClientOptions,
  ApiError,
  type ApiRequest,
  CLIENT_ERROR,
  configuredBaseUrl,
  type DownloadBytes,
  type FetchLike,
  type Session,
  type SessionStore,
} from './client';
export { memorySessionStore } from './memory-session-store';
