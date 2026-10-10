// Stock primitives shared by orders, procurement and production (contracts in §22.2).
// Every function takes an open transaction `db` whose tenant is ctx.orgId.
import { AppError } from '../../utils/errors.js';
import { round3 } from '../../utils/money.js';

// serialise stock decisions per item inside the transaction
const lockItem = (db, itemId) => db.query('select pg_advisory_xact_lock(hashtext($1))', [`stock:${itemId}`]);

// lots of an item with free quantity (on hand minus active reservations), FIFO order
export async function freeLots(db, itemId) {
  const { rows } = await db.query(
    `select l.id, l.lot_no, l.unit_cost, l.received_at,
            coalesce(m.q, 0) as on_hand, coalesce(r.q, 0) as reserved, coalesce(m.q, 0) - coalesce(r.q, 0) as free
       from stock_lots l
       left join (select lot_id, sum(qty) q from stock_movements group by lot_id) m on m.lot_id = l.id
       left join (select lot_id, sum(qty) q from reservations where status = 'active' group by lot_id) r on r.lot_id = l.id
      where l.item_id = $1 and coalesce(m.q, 0) - coalesce(r.q, 0) > 0
      order by l.received_at, l.created_at`,
    [itemId],
  );
  return rows;
}

export async function lotOnHand(db, lotId) {
  const { rows: [r] } = await db.query('select coalesce(sum(qty), 0) as q from stock_movements where lot_id = $1', [lotId]);
  return r.q;
}

// reserve up to `qty` of an item for an order, FIFO by lot. Returns the quantity actually reserved.
export async function reserveFifo(db, ctx, { orderId, itemId, qty, at = null }) {
  await lockItem(db, itemId);
  let left = qty;
  for (const lot of await freeLots(db, itemId)) {
    if (left <= 0) break;
    const take = Math.min(left, lot.free);
    await db.query(
      `insert into reservations (org_id, item_id, lot_id, order_id, qty, created_by, created_at) values ($1,$2,$3,$4,$5,$6, coalesce($7, now()))`,
      [ctx.orgId, itemId, lot.id, orderId, round3(take), ctx.userId ?? null, at],
    );
    left = round3(left - take);
  }
  return round3(qty - left);
}

export const releaseReservations = (db, orderId) =>
  db.query(`update reservations set status = 'released' where order_id = $1 and status = 'active'`, [orderId]);

/**
 * Contract: inventory.issueForWorkOrder(db, ctx, { workOrderId, orderId, items: [{ item_id, qty }] })
 * Issues material FIFO from the ORDER'S reservations (material_issues + 'consume' movements) and marks
 * the reservations consumed. Throws INSUFFICIENT_STOCK when the reservations don't cover a line.
 * Returns the created material_issues rows.
 */
export async function issueForWorkOrder(db, ctx, { workOrderId, orderId, items }) {
  const issued = [];
  for (const { item_id: itemId, qty } of items) {
    await lockItem(db, itemId);
    const { rows: res } = await db.query(
      `select r.id, r.lot_id, r.qty, l.unit_cost
         from reservations r join stock_lots l on l.id = r.lot_id
        where r.order_id = $1 and r.item_id = $2 and r.status = 'active'
        order by l.received_at, r.created_at for update of r`,
      [orderId, itemId],
    );
    let left = qty;
    for (const r of res) {
      if (left <= 0) break;
      const take = Math.min(left, r.qty);
      if ((await lotOnHand(db, r.lot_id)) < take) break; // stock was adjusted away
      const { rows: [mi] } = await db.query(
        `insert into material_issues (org_id, work_order_id, lot_id, item_id, qty, unit_cost, created_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [ctx.orgId, workOrderId, r.lot_id, itemId, round3(take), r.unit_cost, ctx.userId ?? null]);
      await db.query(
        `insert into stock_movements (org_id, item_id, lot_id, type, qty, ref_type, ref_id, created_by)
         values ($1,$2,$3,'consume',$4,'work_order',$5,$6)`,
        [ctx.orgId, itemId, r.lot_id, -round3(take), workOrderId, ctx.userId ?? null]);
      if (take >= r.qty) {
        await db.query(`update reservations set status = 'consumed' where id = $1`, [r.id]);
      } else {
        await db.query(`update reservations set qty = qty - $2 where id = $1`, [r.id, take]);
        await db.query(
          `insert into reservations (org_id, item_id, lot_id, order_id, qty, status, created_by)
           values ($1,$2,$3,$4,$5,'consumed',$6)`, [ctx.orgId, itemId, r.lot_id, orderId, round3(take), ctx.userId ?? null]);
      }
      issued.push(mi);
      left = round3(left - take);
    }
    if (left > 0.0005) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough reserved stock to issue ${round3(qty)} (short by ${left})`, { item_id: itemId, short: left });
    }
  }
  return issued;
}

/**
 * Contract: inventory.produce(db, ctx, { itemId, qty, lotNo, refType, refId, unitCost?, orderId?, type? })
 * Adds produced/scrap output to a lot (created on first use). With orderId the output is reserved for that
 * order so the next stage can issue it. type 'scrap' records waste instead of usable stock.
 */
export async function produce(db, ctx, { itemId, qty, lotNo, refType, refId, unitCost = 0, orderId = null, type = 'produce', warehouseId = null }) {
  await lockItem(db, itemId);
  const { rows: [lot] } = await db.query(
    `insert into stock_lots (org_id, item_id, lot_no, unit_cost, warehouse_id, created_by)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (org_id, item_id, lot_no) do update set unit_cost = case when stock_lots.unit_cost = 0 then excluded.unit_cost else stock_lots.unit_cost end
     returning *`,
    [ctx.orgId, itemId, lotNo, unitCost, warehouseId, ctx.userId ?? null]);
  await db.query(
    `insert into stock_movements (org_id, item_id, lot_id, type, qty, ref_type, ref_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ctx.orgId, itemId, lot.id, type, round3(qty), refType ?? null, refId ?? null, ctx.userId ?? null]);
  if (orderId && type === 'produce') {
    await db.query(
      `insert into reservations (org_id, item_id, lot_id, order_id, qty, created_by) values ($1,$2,$3,$4,$5,$6)`,
      [ctx.orgId, itemId, lot.id, orderId, round3(qty), ctx.userId ?? null]);
  }
  return lot;
}

// items currently below their reorder level (uses v_stock, so RLS applies)
export async function lowStockAmong(db, itemIds) {
  const { rows } = await db.query(
    `select item_id, name, available, reorder_level from v_stock where is_low and item_id = any($1) and reorder_level > 0`, [itemIds]);
  return rows;
}
