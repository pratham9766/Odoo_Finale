// Rate limits for the public endpoints (invites, tracking links, login-page stats).
import rateLimit from 'express-rate-limit';

const json = (code, message) => ({ error: { code, message } });

// invites, onboarding
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many attempts, try again later'),
});

// public tracking link
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many requests'),
});
