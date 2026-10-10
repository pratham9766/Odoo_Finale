import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const issuer = `${env.SUPABASE_URL}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const legacySecret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

export async function verifyToken(token) {
  if (!token) throw new Error('missing token');
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    return payload;
  } catch (err) {
    if (!legacySecret) throw err;
    const { payload } = await jwtVerify(token, legacySecret, { issuer });
    return payload;
  }
}

export async function auth(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
  try {
    const payload = await verifyToken(token);
    req.user = { id: payload.sub, email: payload.email?.toLowerCase() };
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Session expired, please log in again'));
  }
}
