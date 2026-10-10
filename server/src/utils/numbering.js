// prefixes: ORD, PO, GRN, ADJ, WO, DSP, INV, TKT
// (roll numbers R-<order seq>-<n> are built from the order number)
export async function nextNumber(db, prefix) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const { rows } = await db.query(
    `insert into counters (key, value) values ($1, 1)
     on conflict (key) do update set value = counters.value + 1
     returning value`,
    [key],
  );
  return `${prefix}-${year}-${String(rows[0].value).padStart(4, '0')}`;
}
