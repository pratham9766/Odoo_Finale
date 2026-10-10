import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

// invite / device tokens: 32 random bytes, base64url; only sha256(token) is stored
export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

// URL-safe short random string (QR tokens, tracking tokens)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function randomCode(len = 16, alphabet = ALPHABET) {
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
