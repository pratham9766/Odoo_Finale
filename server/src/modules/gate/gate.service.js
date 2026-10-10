// The gate register (backend plan §10.9): every vehicle in and out. A supply or dispatch visit is matched to its dispatch by the
// vehicle number; a supplier's truck arriving also gets its draft GRN (receiptDraft.js). Every function takes an optional `{ at }`
// so the seed can replay history. The guard is never blocked by a missing or mistyped match: an unlinked entry is still logged.

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { Filter, invalid, omit } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { draftReceiptFromDispatch } from './receiptDraft.js';

/** Vehicle numbers are typed "GJ 05 AB 1234", "GJ-05-AB-1234" or "gj05ab1234": compare them without the punctuation. */
const vehicleKey = (expr) => `upper(regexp_replace(${expr}, '[^A-Za-z0-9]', '', 'g'))`;

/** Which dispatches a visit of each purpose can belong to, and the statuses of those the gate is still waiting for. */
const VISITS = {
  supply: { where: `d.kind = 'supply' and d.to_org_id = $1`, waiting: ['confirmed', 'in_transit'] },
  dispatch: { where: `d.kind = 'sales' and d.from_org_id = $1`, waiting: ['packing', 'confirmed', 'in_transit'] },
};
const DISPATCH_COLUMNS = `d.id, d.dispatch_no, d.kind, d.po_id, d.from_org_id`;

const SELECT = `
  select g.*, d.dispatch_no, r.grn_no,
         case when d.kind = 'supply' then so.name else coalesce(bo.name, bc.name) end as party
    from gate_entries g
    left join dispatches d on d.id = g.dispatch_id
    left join organizations so on so.id = d.from_org_id
    left join organizations bo on bo.id = d.to_org_id left join contacts bc on bc.id = d.to_contact_id
    left join goods_receipts r on r.gate_entry_id = g.id`;

/** The visit this vehicle is on right now: its latest entry, when that was an "in". */
async function openVisit(db, orgId, vehicleNo) {
  const { rows: [last] } = await db.query(
    `select direction, purpose, dispatch_id from gate_entries
      where org_id = $1 and ${vehicleKey('vehicle_no')} = ${vehicleKey('$2::text')} order by at desc, id desc limit 1`, [orgId, vehicleNo]);
  return last?.direction === 'in' ? last : null;
}

/**
 * The dispatch an entry is about: the one named, else (leaving) the one the vehicle came in for, else the only dispatch waiting
 * for this vehicle number. `vehicle_matches` is false when a named dispatch was booked on another vehicle.
 */
async function resolveDispatch(db, ctx, { purpose, direction, vehicle_no: vehicleNo, dispatch_id: named }) {
  const visit = VISITS[purpose];
  if (!visit) return null;                                               // visitors and "other" have no dispatch
  let wanted = named;
  if (!wanted && direction === 'out') {
    const open = await openVisit(db, ctx.orgId, vehicleNo);
    if (open?.purpose === purpose) wanted = open.dispatch_id;
  }
  const matches = `(${vehicleKey('d.vehicle_no')} = ${vehicleKey('$3::text')}) as vehicle_matches`;
  if (wanted) {
    const { rows: [d] } = await db.query(`select ${DISPATCH_COLUMNS}, ${matches} from dispatches d where ${visit.where} and d.id = $2`, [ctx.orgId, wanted, vehicleNo]);
    if (!d && named) throw invalid('dispatch_id', `That is not a ${purpose} dispatch of this mill`);
    return d ?? null;
  }
  const { rows } = await db.query(
    `select ${DISPATCH_COLUMNS}, ${matches} from dispatches d where ${visit.where} and d.status = any($2) and ${vehicleKey('d.vehicle_no')} = ${vehicleKey('$3::text')}`,
    [ctx.orgId, visit.waiting, vehicleNo]);
  return rows.length === 1 ? rows[0] : null;                             // two trucks with one number: the guard picks from /gate/expected
}

export function getEntry(ctx, id) {
  return withTenant(ctx, async (db) => {
    const { rows: [entry] } = await db.query(`${SELECT} where g.id = $1 and g.org_id = $2`, [id, ctx.orgId]);
    if (!entry) throw new AppError(404, 'NOT_FOUND', 'Gate entry not found');
    return entry;
  });
}

/**
 * Log a vehicle in or out. A supplier's truck logged in against its dispatch comes back with the draft GRN to hand to the store.
 * @returns the entry (with dispatch_no, party, grn_no) plus `vehicle_matches` and `receipt` ({ id, grn_no, created, lines, unmatched_lots } or null)
 */
export async function logEntry(ctx, input, { at = new Date() } = {}) {
  const { id, dispatch, receipt } = await withTenant(ctx, async (db) => {
    const found = await resolveDispatch(db, ctx, input);
    const { rows: [trip] } = found
      ? await db.query(`select id from trips where dispatch_id = $1 and status <> 'rejected' order by created_at desc limit 1`, [found.id]) : { rows: [] };
    const { rows: [entry] } = await db.query(
      `insert into gate_entries (org_id, direction, vehicle_no, driver_name, purpose, dispatch_id, trip_id, at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [ctx.orgId, input.direction, input.vehicle_no, input.driver_name ?? null, input.purpose, found?.id ?? null, trip?.id ?? null, at, ctx.userId]);
    const draft = found?.kind === 'supply' && input.direction === 'in'
      ? await draftReceiptFromDispatch(db, ctx, { dispatch: found, entryId: entry.id, vehicleNo: input.vehicle_no, at }) : null;
    return { id: entry.id, dispatch: found, receipt: draft };
  });

  bus.emit('gate.logged', {
    orgId: ctx.orgId, entryId: id, direction: input.direction, purpose: input.purpose, vehicleNo: input.vehicle_no,
    dispatchId: dispatch?.id ?? null, receiptId: receipt?.id ?? null,
  });
  return { ...(await getEntry(ctx, id)), vehicle_matches: dispatch?.vehicle_matches ?? null, receipt };
}

/** The register, newest first. `inside` keeps only vehicles whose latest entry is an "in". → { rows, total } */
export function listEntries(ctx, { direction, purpose, inside, q, from, to, page = 1, limit = 100 } = {}) {
  return withTenant(ctx, async (db) => {
    const f = new Filter(ctx.orgId, 'g').eq('g.direction', direction).eq('g.purpose', purpose).search(['g.vehicle_no', 'g.driver_name'], q);
    if (from) f.where('g.at >= ?::date', from);
    if (to) f.where('g.at < ?::date + 1', to);
    if (inside) {
      f.where(`g.direction = 'in' and not exists (
        select 1 from gate_entries o where o.org_id = g.org_id and ${vehicleKey('o.vehicle_no')} = ${vehicleKey('g.vehicle_no')} and (o.at, o.id) > (g.at, g.id))`);
    }
    const { rows } = await db.query(
      `${SELECT} where ${f.sql} order by g.at desc, g.id desc limit $${f.params.length + 1} offset $${f.params.length + 2}`,
      [...f.params, limit, (page - 1) * limit]);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from gate_entries g where ${f.sql}`, f.params);
    return { rows, total: n };
  });
}

/** Supplier dispatches on their way that have not reached the gate yet, soonest first, each with its lots. */
export function expectedSupply(ctx) {
  return withTenant(ctx, async (db) => {
    const { rows: dispatches } = await db.query(
      `select d.id, d.dispatch_no, d.status, d.vehicle_no, d.driver_name, d.driver_phone, d.confirmed_at,
              so.name as supplier, po.po_no, tr.name as transporter, t.eta
         from dispatches d
         join organizations so on so.id = d.from_org_id
         left join purchase_orders po on po.id = d.po_id
         left join organizations tr on tr.id = d.transporter_org_id
         left join lateral (select eta from trips where dispatch_id = d.id and status <> 'rejected' order by created_at desc limit 1) t on true
        where d.kind = 'supply' and d.to_org_id = $1 and d.status = any($2)
          and not exists (select 1 from gate_entries g where g.dispatch_id = d.id and g.direction = 'in')
        order by coalesce(t.eta, d.confirmed_at), d.dispatch_no`, [ctx.orgId, VISITS.supply.waiting]);
    const { rows: lots } = await db.query(
      `select dl.dispatch_id, dl.lot_no, dl.colour, dl.qty, dl.uom, i.name as item
         from dispatch_lots dl left join po_lines pl on pl.id = dl.po_line_id left join items i on i.id = pl.item_id
        where dl.dispatch_id = any($1::uuid[]) order by dl.lot_no`, [dispatches.map((d) => d.id)]);
    return dispatches.map((d) => ({ ...d, lots: lots.filter((l) => l.dispatch_id === d.id).map((l) => omit(l, ['dispatch_id'])) }));
  });
}
