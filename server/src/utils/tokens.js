// Random tokens and their hashes. Anything that grants access (kiosk device tokens, invites, OTPs)
// is stored only as sha256Hex(token); the plain token is shown once at creation.

import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token. 12 bytes → 16 chars (badges, roll labels); 32 bytes → 43 chars (invites, devices). */
export const randomToken = (bytes = 12) => randomBytes(bytes).toString('base64url');

/** Hex sha256, the form stored in token_hash columns and passed to resolve_*() functions. */
export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');
