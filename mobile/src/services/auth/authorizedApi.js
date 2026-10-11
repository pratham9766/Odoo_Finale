// The one place that attaches the access token and deals with an expired session.
//
//  * 401 (UNAUTHENTICATED / INVALID_TOKEN) means "your token is not valid": the server stops BEFORE running anything. 403 (FORBIDDEN, NOT_STAFF,
//    ACCOUNT_DISABLED) means "you are signed in but not allowed": it is never answered by refreshing, only shown.
//  * On a 401 the session is refreshed ONCE, however many requests fail at the same moment (single-flight), and then
//      - reads (GET) are retried automatically,
//      - writes that carry an Idempotency-Key are retried (the key makes a second attempt safe),
//      - other writes are NOT replayed: the person is told to tap again.
//  * A refresh that fails because the refresh token is no longer valid ends the session (onAuthLost). A refresh that fails because
//    the phone is offline does not: the person stays signed in and sees an offline message.

import { ApiError } from '../api/client.js';

const isRetrySafe = ({ method = 'GET', idempotencyKey }) => method === 'GET' || method === 'HEAD' || Boolean(idempotencyKey);

/**
 * @param {{ getAccessToken: () => Promise<string|undefined>, refresh: () => Promise<string>, request: Function, onAuthLost: () => void }} deps
 *   refresh() resolves to the new access token, or throws an error with `fatal: true` when the session cannot be renewed
 */
export function createAuthorizedApi({ getAccessToken, refresh, request, onAuthLost }) {
  let inflight = null;
  const refreshOnce = () => {
    inflight ??= refresh().finally(() => { inflight = null; });
    return inflight;
  };

  return async function api(path, options = {}) {
    const token = await getAccessToken();
    try {
      return await request(path, { ...options, token });
    } catch (error) {
      if (error?.status !== 401) throw error;
      let renewed;
      try {
        renewed = await refreshOnce();
      } catch (refreshError) {
        if (refreshError?.fatal) { onAuthLost(); throw new ApiError('Your session has ended. Sign in again.', 401, 'SESSION_EXPIRED'); }
        throw new ApiError('Cannot reach the server to renew your session. Check your connection.', 0, 'NETWORK');
      }
      if (!isRetrySafe(options)) throw new ApiError('Your session had expired and was renewed. Nothing was saved. Try again.', 401, 'AUTH_RENEWED');
      return request(path, { ...options, token: renewed });
    }
  };
}
