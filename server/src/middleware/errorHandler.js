// Turns errors into the API's JSON error format (validation, database constraint, size limit, unexpected).
import { AppError } from '../utils/errors.js';

const PG_MAP = {
  23505: [409, 'DUPLICATE', 'Already exists'],
  23503: [409, 'REFERENCE_ERROR', 'Linked record not found or still in use'],
  23514: [422, 'CHECK_FAILED', 'Value not allowed'],
  23502: [422, 'VALIDATION_FAILED', 'A required value is missing'],
  '22P02': [422, 'VALIDATION_FAILED', 'Invalid value format'],
  '22003': [422, 'VALIDATION_FAILED', 'A number is too large'],
  42501: [403, 'FORBIDDEN', 'Not allowed'], // RLS violation
  57014: [504, 'TIMEOUT', 'Query took too long'],
};

// unique constraints with a business meaning
const CONSTRAINT_MAP = {
  dispatch_rolls_roll_unique: [409, 'ROLL_ALREADY_DISPATCHED', 'This roll is already in another dispatch'],
  rfid_credentials_active_uid: [409, 'CARD_IN_USE', 'This card is already assigned to another worker'],
  rfid_credentials_active_worker: [409, 'CARD_ALREADY_ASSIGNED', 'This worker already has an active card'],
};

export function notFoundRoute(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Malformed JSON body' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large' } });
  }
  const byConstraint = err.constraint && CONSTRAINT_MAP[err.constraint];
  if (byConstraint) {
    return res.status(byConstraint[0]).json({ error: { code: byConstraint[1], message: byConstraint[2] } });
  }
  const mapped = PG_MAP[err.code];
  if (mapped) {
    return res.status(mapped[0]).json({
      error: { code: mapped[1], message: mapped[2], details: err.constraint ? { constraint: err.constraint } : undefined },
    });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
