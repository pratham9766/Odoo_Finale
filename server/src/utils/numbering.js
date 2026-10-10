// prefixes: ORD, PO, GRN, ADJ, WO, DSP, TRP, INV, FRT, TKT
// (roll numbers R-<order seq>-<n> are built from the order number)
export async function nextNumber(db, orgId, prefix) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const { rows } = await db.query(
    `insert into org_counters (org_id, key, value) values ($1, $2, 1)
     on conflict (org_id, key) do update set value = org_counters.value + 1
     returning value`,
    [orgId, key],
  );
  return `${prefix}-${year}-${String(rows[0].value).padStart(4, '0')}`;
}
