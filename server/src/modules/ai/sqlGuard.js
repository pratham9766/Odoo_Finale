import { AppError } from '../../utils/errors.js';

const FORBIDDEN = /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|prepare|set|reset|listen|notify|vacuum|analyze|lock|pg_sleep|pg_read_file|lo_import|lo_export|dblink|current_setting|set_config|lateral|into)\b/i;
const SYSTEM_SCHEMAS = /\b(pg_[a-z_]+|information_schema|auth|storage|extensions)\b/i;
// "from a, b" would let a second, unchecked table in; joins must be explicit
const COMMA_JOIN = /\bfrom\s+(?:(?!\b(?:where|group|order|limit|having|union|intersect|except|join|left|right|inner|full|cross|on|window|offset|fetch)\b)[^(),])*,/i;

export function guardSql(sql, allowed) {
  const fail = (m) => { throw new AppError(422, 'AI_UNSAFE_SQL', m); };
  const s = String(sql ?? '').trim().replace(/;\s*$/, '');
  if (!s) fail('Empty query');
  if (!/^(select|with)\b/i.test(s)) fail('Only SELECT queries are allowed');
  if (s.includes(';')) fail('Multiple statements are not allowed');
  if (/--|\/\*/.test(s)) fail('Comments are not allowed');
  if (FORBIDDEN.test(s)) fail('Forbidden keyword');
  if (SYSTEM_SCHEMAS.test(s)) fail('System schemas are not readable');
  if (COMMA_JOIN.test(s)) fail('Use explicit JOINs instead of comma-separated tables');

  const cteNames = [...s.matchAll(/(?:\bwith\b|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase());
  const refs = [...s.matchAll(/\b(?:from|join)\s+([a-z_"][a-z0-9_."]*)/gi)].map((m) => m[1].toLowerCase().replace(/"/g, ''));
  if (!refs.length) fail('Query must read from an allowed view');
  for (const r of refs) {
    const name = r.replace(/^public\./, '');
    if (!cteNames.includes(name) && !allowed.includes(name)) fail(`Not allowed to read "${r}"`);
  }
  return `select * from (${s}) as q limit 200`;
}
