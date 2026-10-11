// Permission checks: can(...), module switches, scope checks, and hiding price fields from roles that may not see them.
import { AppError } from '../utils/errors.js';

export const can = (...perms) => (req, _res, next) =>
  perms.some((p) => req.ctx.permissions.has(p))
    ? next()
    : next(new AppError(403, 'FORBIDDEN', `Missing permission: ${perms.join(' or ')}`));

export const requireModule = (name) => (req, _res, next) =>
  req.ctx.modules[name] !== false
    ? next()
    : next(new AppError(403, 'MODULE_DISABLED', `Module "${name}" is disabled`));

// empty scope list = whole org
export function isInScope(ctx, kind, id) {
  const ids = ctx.scope?.[`${kind}_ids`];
  return !ids || ids.length === 0 || ids.includes(id);
}

// scope ids for SQL filters: `and (cardinality($n::uuid[]) = 0 or x = any($n))`
export const scopeIds = (ctx, kind) => ctx.scope?.[`${kind}_ids`] ?? [];

export const inScope = (kind, pick) => (req, _res, next) => {
  const id = pick(req);
  return !id || isInScope(req.ctx, kind, id)
    ? next()
    : next(new AppError(403, 'OUT_OF_SCOPE', `This ${kind} is outside your assigned area`));
};

export const PRICE_FIELDS = ['rate', 'amount', 'subtotal', 'tax', 'total', 'unit_cost', 'std_rate', 'paid_amount'];

// strip confidential fields unless the user has the permission
export function hidePrices(ctx, row, fields = PRICE_FIELDS) {
  if (!row || ctx.permissions.has('orders.view_price')) return row;
  const copy = { ...row };
  for (const f of fields) delete copy[f];
  return copy;
}
