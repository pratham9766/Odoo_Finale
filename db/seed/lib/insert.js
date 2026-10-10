// Tiny helpers every generator uses. `db` is anything with query(sql, params) → { rows } (pg Client or PGlite).

/** Insert rows that all have the same keys in one statement; returns the inserted rows. jsonb values must be JSON strings. */
export async function insertRows(db, table, rows) {
  if (!rows.length) return [];
  const columns = Object.keys(rows[0]);
  const params = [];
  const tuples = rows.map((row) => `(${columns.map((c) => { params.push(row[c]); return `$${params.length}`; }).join(', ')})`);
  const { rows: inserted } = await db.query(
    `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')} returning *`, params);
  return inserted;
}

/** { key value → id } for inserted rows, e.g. idsBy(stages, 'name') → { Spinning: '…', Weaving: '…' }. */
export const idsBy = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.id]));

/** Look a name up in an { name → id } map, failing loudly (a typo in config should stop the seed, not insert a null). */
export function need(map, name, what) {
  if (!map[name]) throw new Error(`Seed config refers to ${what} "${name}" which does not exist (have: ${Object.keys(map).join(', ')})`);
  return map[name];
}
