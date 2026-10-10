import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const json = (code, message) => ({ error: { code, message } });

// per user when logged in, else per IP
const userKey = (req) => req.user?.id ?? ipKeyGenerator(req.ip);

// invites, connect codes, onboarding
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many attempts, try again later'),
});

// kiosk device: a whole factory shift punches through one device
export const kioskLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many punches from this device'),
});

// AI chat: 20 questions per user per hour
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: userKey,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'AI question limit reached (20 per hour)'),
});

// OTP delivery attempts (the 5-tries lock lives in trips; this is a coarse guard)
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: userKey,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many OTP attempts'),
});

// public tracking link
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many requests'),
});
