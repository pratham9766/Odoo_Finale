# Backend integration

The mobile app has no backend of its own: it calls the SAMETA Express API (`/api/v1`) with the signed-in person's Supabase token. **The authoritative description of every route the app uses (method, path, request, response, permission, state change) is [`docs/API_CONTRACTS.md`](../../docs/API_CONTRACTS.md) at the repository root**, written from the source and checked by database tests.

Facts that older notes got wrong:

- **One mill per database.** There is no organisation / tenant: no `x-org-id` header, no `/me/orgs`, no organisation switcher. The app sends only `Authorization: Bearer <token>`, and `Idempotency-Key` on writes that must not be applied twice.
- **Files in `src/services/api/`**: `client.js` (one HTTP call, with timeout and `NETWORK` / `TIMEOUT` failure kinds), `errors.js` (turns any error into words for the floor and says whether a write may have been saved). Token handling is in `src/services/auth/authorizedApi.js`; retry-safe writes are in `src/services/submissions/`.
- **Token refresh**: a `401` triggers one shared refresh, then reads (and keyed writes) are retried; a `403` is shown as "not allowed" and never retried. An unreachable server does not sign the person out. See the header of `authorizedApi.js`.
- **Writes that cannot be repeated** (production output, new roll) carry an `Idempotency-Key`, are saved on the phone before sending and stay listed as "Unconfirmed" until the server confirms them, even after a restart. See `submissionEngine.js`.
- **Live updates**: the app polls (30 to 120 s) and refetches after each action; there is no socket connection on the phone.
