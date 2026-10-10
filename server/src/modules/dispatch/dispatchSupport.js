// Queries used by more than one dispatch operation (scan, get, confirm, delivery).

/** Ordered / earlier dispatches / scanned on this one, all in metres, as numbers. */
export async function dispatchTotals(db, dispatch) {
  const { rows: [t] } = await db.query(
    `select (select coalesce(sum(length_m), 0) from dispatch_rolls where dispatch_id = $1)::float as scanned,
            (select coalesce(sum(qty), 0) from order_lines where order_id = $2)::float as ordered,
            (select coalesce(sum(dr.length_m), 0) from dispatch_rolls dr join dispatches d2 on d2.id = dr.dispatch_id
              where d2.order_id = $2 and d2.status <> 'cancelled' and d2.id <> $1)::float as earlier`, [dispatch.id, dispatch.order_id]);
  return { ...t, remaining: t.ordered - t.earlier - t.scanned };
}

/** The rolls scanned onto a dispatch: id, number, weight and the length that goes on the invoice. */
export async function scannedRolls(db, dispatchId) {
  const { rows } = await db.query(
    `select r.id, r.roll_no, r.weight_kg, dr.length_m from dispatch_rolls dr join rolls r on r.id = dr.roll_id
      where dr.dispatch_id = $1 order by r.roll_no`, [dispatchId]);
  return rows;
}

/**
 * The dispatch's rolls reach the buyer: dispatched → delivered, except the ones reported as short or damaged.
 */
export async function markRollsDelivered(db, dispatchId, exceptRollIds, at) {
  const { rows } = await db.query(
    `update rolls r set status = 'delivered'
      where r.status = 'dispatched' and r.id <> all($2::uuid[])
        and r.id in (select roll_id from dispatch_rolls where dispatch_id = $1)
      returning r.id`, [dispatchId, exceptRollIds]);
  for (const { id } of rows) {
    await db.query(`insert into roll_history (roll_id, event, at) values ($1, 'delivered', $2)`, [id, at]);
  }
  return rows.length;
}
