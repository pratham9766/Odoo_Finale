import { cleanPath } from './contracts.js';

export class ApiError extends Error {
  constructor(message, status = 0, code = 'NETWORK', details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

// Credentials are captured per request. There is one mill, so no tenant header is sent.
export async function request(path, { token, method = 'GET', body, signal, baseUrl = 'http://localhost:4000' } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${cleanPath(path)}`, {
      method, signal: controller.signal,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(payload?.error?.message || `Request failed (${response.status}).`, response.status, payload?.error?.code, payload?.error?.details);
    if (!payload || !Object.hasOwn(payload, 'data')) throw new ApiError('The server returned an unexpected response.', response.status, 'INVALID_RESPONSE');
    return payload;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError(error.name === 'AbortError' ? 'The request timed out. Check your connection and try again.' : 'Cannot reach the server. Check your connection and try again.');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

/** Download a PDF/CSV that needs the login token: fetch it, then hand it to the browser as a file. */
export async function download(path, { token, baseUrl = 'http://localhost:4000', filename }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${cleanPath(path)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.message || `Download failed (${response.status}).`, response.status, payload?.error?.code);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
