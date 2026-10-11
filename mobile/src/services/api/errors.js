export class IntegrationUnavailableError extends Error {
  constructor(feature) {
    super(`${feature} is not connected yet.`);
    this.name = 'IntegrationUnavailableError';
    this.code = 'INTEGRATION_UNAVAILABLE';
  }
}

/**
 * Turn any error into something a person on the shop floor can act on.
 * kind: offline | timeout | session | forbidden | conflict | validation | server | config
 * `uncertain` is true only when a WRITE may have been saved although we got no answer (timeout / network drop / server error).
 */
export function describeError(error, { write = false } = {}) {
  const code = error?.code;
  const status = error?.status ?? 0;
  if (code === 'NOT_CONFIGURED') return { kind: 'config', title: 'App not configured', message: error.message, retryable: false, uncertain: false };
  if (code === 'NETWORK') return { kind: 'offline', title: 'No connection', message: write ? 'Your phone could not reach the server. The entry may not have been sent.' : 'Cannot reach the server. Check your Wi-Fi and pull down to try again.', retryable: true, uncertain: write };
  if (code === 'TIMEOUT') return { kind: 'timeout', title: 'No answer from the server', message: write ? 'The server did not answer in time. The entry may have been saved. Check before entering it again.' : 'The server is slow to answer. Try again in a moment.', retryable: true, uncertain: write };
  if (code === 'SESSION_EXPIRED') return { kind: 'session', title: 'Signed out', message: 'Your session has ended. Sign in again to continue.', retryable: false, uncertain: false };
  if (code === 'AUTH_RENEWED') return { kind: 'session', title: 'Session renewed', message: 'Your session had expired and was renewed. Nothing was saved. Please try again.', retryable: true, uncertain: false };
  if (status === 401) return { kind: 'session', title: 'Signed out', message: 'Your session has ended. Sign in again to continue.', retryable: false, uncertain: false };
  if (status === 403) return { kind: 'forbidden', title: 'Not allowed', message: error.message || 'Your role does not allow this.', retryable: false, uncertain: false };
  if (status === 409) return { kind: 'conflict', title: 'Cannot do that now', message: error.message, retryable: false, uncertain: false };
  if (status === 400 || status === 422) return { kind: 'validation', title: 'Check the entry', message: error.message, retryable: false, uncertain: false };
  if (status >= 500) return { kind: 'server', title: 'Server problem', message: write ? 'The server had a problem. The entry may not have been saved. Check before entering it again.' : 'The server had a problem. Try again shortly.', retryable: true, uncertain: write };
  return { kind: 'server', title: 'Something went wrong', message: error?.message || 'Unexpected error.', retryable: true, uncertain: false };
}
