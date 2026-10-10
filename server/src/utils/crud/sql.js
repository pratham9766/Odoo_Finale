// SQL fragment builders for the CRUD factory.
// Column names passed in here are written by us in code, never taken from a request;
// every value goes through a bound parameter.

/**
 * Collects the WHERE conditions of a list query. Always starts with `<alias>.<column> = $1` (the org).
 * Two-party tables name the side: new Filter(orgId, 'd', 'from_org_id') for what a mill dispatched.
 */
export class Filter {
  #clauses;
  #params;

  constructor(orgId, alias = 't', column = 'org_id') {
    this.#clauses = [`${alias}.${column} = $1`];
    this.#params = [orgId];
  }

  #bind(value) {
    this.#params.push(value);
    return `$${this.#params.length}`;
  }

  /** column = value. Skipped when value is undefined or null, so `false` and 0 still filter. */
  eq(column, value) {
    if (value !== undefined && value !== null) this.#clauses.push(`${column} = ${this.#bind(value)}`);
    return this;
  }

  /** A hand-written condition; each `?` becomes the next bound parameter. For things like `exists (...)` the helpers don't cover. */
  where(condition, ...values) {
    this.#clauses.push(condition.replace(/\?/g, () => this.#bind(values.shift())));
    return this;
  }

  /** `true` → column is null, `false` → column is not null; undefined leaves the query alone. */
  isNull(column, flag) {
    if (flag !== undefined) this.#clauses.push(`${column} is ${flag ? '' : 'not '}null`);
    return this;
  }

  /** uuid column in a list of ids. An empty or missing list means "no restriction" (whole org). */
  anyOf(column, ids) {
    if (ids?.length) this.#clauses.push(`${column} = any(${this.#bind(ids)}::uuid[])`);
    return this;
  }

  /** Case-insensitive "contains" match on any of the columns. */
  search(columns, text) {
    if (text) {
      const like = this.#bind(`%${text.replace(/[\\%_]/g, '\\$&')}%`);
      this.#clauses.push(`(${columns.map((c) => `${c} ilike ${like}`).join(' or ')})`);
    }
    return this;
  }

  get sql() { return this.#clauses.join(' and '); }
  get params() { return [...this.#params]; }
}

/** Keep only the allowed keys that are present (undefined = not sent; null is a real value). */
export const pick = (input, allowed) =>
  Object.fromEntries(allowed.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));

/** A copy of the row without the given keys (secrets, fields a caller may not see). */
export const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

/** `a = $2, b = $3` plus the values, numbering placeholders from firstIndex. */
export function setClause(values, firstIndex = 1) {
  const keys = Object.keys(values);
  return { sql: keys.map((k, i) => `${k} = $${firstIndex + i}`).join(', '), values: Object.values(values) };
}

/** Column list, placeholder list and values for an INSERT. */
export function insertClause(values, firstIndex = 1) {
  const keys = Object.keys(values);
  return {
    columns: keys.join(', '),
    placeholders: keys.map((_, i) => `$${firstIndex + i}`).join(', '),
    values: Object.values(values),
  };
}
