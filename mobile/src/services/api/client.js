import { API_URL } from '../../config.js';
import { cleanPath } from '../../utils/contracts.js';

export class ApiError extends Error {
  constructor(message, status = 0, code = 'NETWORK', details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

const TIMEOUT_MS = 15000;

/**
 * One HTTP call to the SAMETA API. Callers pass the access token; token refresh lives in services/auth/authorizedApi.js.
 * `idempotencyKey` is sent as the Idempotency-Key header (see server/src/utils/idempotency.js).
 *
 * Failure kinds, in `code`:
 *   NETWORK  the request never got an answer (offline, wrong address, server down)
 *   TIMEOUT  no answer within 15 s: for a write the outcome is UNKNOWN, it may have been saved
 *   anything else: the server's own error code, with its HTTP status
 */
export async function request(path, { token, method = 'GET', body, signal, idempotencyKey, baseUrl = API_URL } = {}) {
  if (!baseUrl) throw new ApiError('The app has no server address. Set EXPO_PUBLIC_API_URL and restart.', 0, 'NOT_CONFIGURED');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => { timedOut = true; abort(); }, TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${cleanPath(path)}`, {
      method, signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(payload?.error?.message || `Request failed (${response.status}).`, response.status, payload?.error?.code, payload?.error?.details);
    if (!payload || !Object.hasOwn(payload, 'data')) throw new ApiError('The server returned an unexpected response.', response.status, 'INVALID_RESPONSE');
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted && !timedOut) throw error;
    if (timedOut) throw new ApiError('The server did not answer in time.', 0, 'TIMEOUT');
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export default { request };
