// AppError (status, code, message) and small helpers: notFound, badState, must.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const badState = (message) => new AppError(409, 'INVALID_STATE_TRANSITION', message);

// throw if a query returned no row
export function must(row, what) {
  if (!row) throw notFound(what);
  return row;
}
