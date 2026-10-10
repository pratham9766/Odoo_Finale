// Small helpers the report definitions share.

import { round2 } from '../../utils/money.js';

/** { key: Σ rows[key] } for the numeric columns: the totals row of a table. */
export const totalsOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, round2(rows.reduce((n, r) => n + Number(r[k] ?? 0), 0))]));

/** part ÷ whole as a percentage with one decimal, or null when there is no whole to compare with. */
export const pct = (part, whole) => (Number(whole) > 0 ? Math.round((1000 * Number(part)) / Number(whole)) / 10 : null);

/** Column descriptors for toCsv / the table header: ['key', 'Label'] pairs. */
export const columns = (...pairs) => pairs.map(([key, label]) => ({ key, label }));
