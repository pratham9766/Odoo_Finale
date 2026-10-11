// Validates request body / query / params with zod and shares pagination and id schemas.
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

// Express 5: req.query is read-only, so parsed data goes to req.valid = { body, query, params }
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid ?? {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) {
      req.valid[part] = req[part] ?? {};
      continue;
    }
    const r = schemas[part].safeParse(req[part] ?? {});
    if (!r.success) return next(new AppError(422, 'VALIDATION_FAILED', 'Invalid input', z.flattenError(r.error)));
    req.valid[part] = r.data;
  }
  next();
};

// shared zod helpers
export const zId = z.string().uuid();
export const idParam = z.object({ id: zId });
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
};
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const zBoolStr = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
