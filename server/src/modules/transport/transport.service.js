import { withTenant, withSystem } from '../../db/withTenant.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { nextNumber } from '../../utils/numbering.js';
import { otpHash, safeEqualHex } from '../../utils/otp.js';
import { paged, where } from '../../utils/paginate.js';
import { assertOrgPath } from '../../utils/storage.js';
import { round2 } from '../../utils/money.js';
import { bus } from '../../events/bus.js';
import { tripEventPayload } from './trips.core.js';

const FORWARD = ['assigned', 'picked_up', 'in_transit', 'reached'];
const MAX_OTP_TRIES = 5;
const LOCK_MINUTES = 15;

// ---------- fleet ----------

export const listVehicles = (ctx) => withTenant(ctx, async (db) => (await db.query('select * from vehicles order by vehicle_no')).rows);

export const createVehicle = (ctx, i) =>
  withTenant(ctx, async (db) => (await db.query(
    'insert into vehicles (org_id, vehicle_no, type, capacity_kg) values ($1,$2,$3,$4) returning *',
    [ctx.orgId, i.vehicle_no, i.type ?? null, i.capacity_kg ?? null])).rows[0]);

export const updateVehicle = (ctx, id, i) =>
  withTenant(ctx, async (db) => must((await db.query(
    `update vehicles set vehicle_no = coalesce($2, vehicle_no), type = coalesce($3, type), capacity_kg = coalesce($4, capacity_kg)
      where id = $1 returning *`, [id, i.vehicle_no ?? null, i.type ?? null, i.capacity_kg ?? null])).rows[0], 'Vehicle'));

export const deleteVehicle = (ctx, id) =>
  withTenant(ctx, async (db) => {
    if (!(await db.query('delete from vehicles where id = $1', [id])).rowCount) throw notFound('Vehicle');
    return { id };
  });

async function resolveDriverUser(db, ctx, email) {
  if (!email) return null;
  const { rows: [p] } = await db.query(
    `select p.id from profiles p join memberships m on m.user_id = p.id and m.org_id = $1 where lower(p.email) = $2`, [ctx.orgId, email]);
  if (!p) throw new AppError(422, 'VALIDATION_FAILED', 'No staff member with this email. Invite them with the Driver role first.');
  return p.id;
}

export const listDrivers = (ctx) =>
  withTenant(ctx, async (db) => (await db.query(
    `select d.*, p.email as user_email from drivers d left join profiles p on p.id = d.user_id order by d.name`)).rows);

export const createDriver = (ctx, i) =>
  withTenant(ctx, async (db) => {
    const userId = await resolveDriverUser(db, ctx, i.user_email);
    return (await db.query('insert into drivers (org_id, name, phone, licence_no, user_id) values ($1,$2,$3,$4,$5) returning *',
      [ctx.orgId, i.name, i.phone ?? null, i.licence_no ?? null, userId])).rows[0];
  });

export const updateDriver = (ctx, id, i) =>
  withTenant(ctx, async (db) => {
    const userId = i.user_email ? await resolveDriverUser(db, ctx, i.user_email) : null;
    return must((await db.query(
      `update drivers set name = coalesce($2, name), phone = coalesce($3, phone), licence_no = coalesce($4, licence_no),
              user_id = coalesce($5, user_id) where id = $1 returning *`,
      [id, i.name ?? null, i.phone ?? null, i.licence_no ?? null, userId])).rows[0], 'Driver');
  });

export const deleteDriver = (ctx, id) =>
  withTenant(ctx, async (db) => {
    if (!(await db.query('delete from drivers where id = $1', [id])).rowCount) throw notFound('Driver');
    return { id };
  });

// ---------- trips ----------

const TRIP_SELECT = `
  select t.id, t.trip_no, t.dispatch_id, t.status, t.transporter_org_id, t.requester_org_id, t.receiver_org_id,
         t.vehicle_id, t.driver_id, t.pickup_address, t.drop_address, t.roll_count, t.weight_kg, t.freight_amount,
         t.eta, t.delivered_at, t.receiver_name, t.pod_photo_path, t.created_at, t.otp_locked_until,
         d.dispatch_no, d.order_id, v.vehicle_no, dr.name as driver_name, dr.phone as driver_phone,
         ro.name as requester_name, rc.name as receiver_name_org
    from trips t
    left join dispatches d on d.id = t.dispatch_id
    left join vehicles v on v.id = t.vehicle_id
    left join drivers dr on dr.id = t.driver_id
    left join organizations ro on ro.id = t.requester_org_id
    left join organizations rc on rc.id = t.receiver_org_id`;

async function loadTrip(db, id, { lock = false } = {}) {
  const { rows: [t] } = await db.query(`select * from trips where id = $1 ${lock ? 'for update' : ''}`, [id]);
  return must(t, 'Trip');
}

async function addEvent(db, trip, status, userId, note = null) {
  await db.query(
    `insert into trip_events (trip_id, transporter_org_id, requester_org_id, receiver_org_id, status, note, created_by)
     values ($1,$2,$3,$4,$5,$6,$7)`, [trip.id, trip.transporter_org_id, trip.requester_org_id, trip.receiver_org_id, status, note, userId ?? null]);
}

export const listTrips = (ctx, q, { asTransporter = true } = {}) =>
  withTenant(ctx, async (db) => {
    const w = where().add('t.dispatch_id = ?', q.dispatch_id);
    if (asTransporter) w.raw('t.transporter_org_id = ?', ctx.orgId);
    if (q.status) w.raw('t.status = any(?::text[])', q.status.split(','));
    const { rows, meta } = await paged(db, `${TRIP_SELECT} ${w.sql}`, w.params, q, 'created_at desc');
    return { data: rows, meta };
  });

// any party (transporter, sender, receiver) may follow a trip; RLS decides
export const getTrip = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rows: [t] } = await db.query(`${TRIP_SELECT} where t.id = $1`, [id]);
    must(t, 'Trip');
    const { rows: events } = await db.query('select status, note, at from trip_events where trip_id = $1 order by at', [id]);
    return { ...t, events };
  });

async function transition(ctx, id, { from, to, note, apply }) {
  const trip = await withTenant(ctx, async (db) => {
    const t = await loadTrip(db, id, { lock: true });
    if (t.transporter_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'This trip belongs to another transporter');
    if (!from.includes(t.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', `Trip is ${t.status}`);
    const updated = await apply(db, t);
    await addEvent(db, t, to, ctx.userId, note);
    await audit(db, ctx, { action: to, table: 'trips', id });
    return updated ?? (await loadTrip(db, id));
  });
  bus.emit('trip.status_changed', tripEventPayload(trip, to));
  return getTrip(ctx, id);
}

export const acceptTrip = (ctx, id) =>
  transition(ctx, id, { from: ['requested'], to: 'accepted',
    apply: async (db) => (await db.query(`update trips set status = 'accepted' where id = $1 returning *`, [id])).rows[0] });

export const rejectTrip = (ctx, id, { reason }) =>
  transition(ctx, id, { from: ['requested'], to: 'rejected', note: reason,
    apply: async (db) => (await db.query(`update trips set status = 'rejected' where id = $1 returning *`, [id])).rows[0] });

export const assignTrip = (ctx, id, { vehicle_id, driver_id, eta }) =>
  transition(ctx, id, { from: ['accepted', 'assigned'], to: 'assigned',
    apply: async (db) => {
      must((await db.query('select 1 from vehicles where id = $1', [vehicle_id])).rows[0], 'Vehicle');
      must((await db.query('select 1 from drivers where id = $1', [driver_id])).rows[0], 'Driver');
      return (await db.query(
        `update trips set status = 'assigned', vehicle_id = $2, driver_id = $3, eta = $4 where id = $1 returning *`,
        [id, vehicle_id, driver_id, eta ?? null])).rows[0];
    } });

// ---------- driver ----------

async function myDriverIds(db, ctx) {
  return (await db.query('select id from drivers where user_id = $1', [ctx.userId])).rows.map((r) => r.id);
}

export const driverTrips = (ctx) =>
  withTenant(ctx, async (db) => {
    const ids = await myDriverIds(db, ctx);
    if (!ids.length) return [];
    return (await db.query(
      `${TRIP_SELECT} where t.driver_id = any($1) and t.status in ('assigned','picked_up','in_transit','reached') order by t.eta nulls last, t.created_at`, [ids])).rows;
  });

async function driverTrip(db, ctx, id) {
  const ids = await myDriverIds(db, ctx);
  const t = await loadTrip(db, id, { lock: true });
  if (t.transporter_org_id !== ctx.orgId || !ids.includes(t.driver_id)) throw notFound('Trip');
  return t;
}

// cross-tenant effects run in the sender's tenant after the driver's transaction commits
const syncDispatch = (t, status) =>
  withSystem(t.requester_org_id, async (db) => {
    await db.query(
      `update dispatches set status = $2, delivered_at = case when $2 = 'delivered' then now() else delivered_at end where id = $1`, [t.dispatch_id, status]);
    if (status === 'delivered') {
      await db.query(`update rolls set status = 'delivered' where id in (select roll_id from dispatch_rolls where dispatch_id = $1)`, [t.dispatch_id]);
    }
    return (await db.query('select order_id from dispatches where id = $1', [t.dispatch_id])).rows[0]?.order_id;
  });

export async function driverStatus(ctx, id, { status, note }) {
  const trip = await withTenant(ctx, async (db) => {
    const t = await driverTrip(db, ctx, id);
    const cur = FORWARD.indexOf(t.status);
    if (cur < 0 || FORWARD.indexOf(status) <= cur) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Cannot go from ${t.status} to ${status}`);
    }
    const { rows: [u] } = await db.query('update trips set status = $2 where id = $1 returning *', [id, status]);
    await addEvent(db, t, status, ctx.userId, note);
    return u;
  });
  await syncDispatch(trip, 'in_transit'); // picked_up, in_transit and reached all mean the goods are on the road
  bus.emit('trip.status_changed', tripEventPayload(trip, status));
  return { id, status };
}

// §11.11: sha256(tripId + otp), 5 wrong tries lock the trip for 15 minutes
export async function deliver(ctx, id, { otp, receiver_name, photo_path }) {
  if (photo_path) assertOrgPath(ctx.orgId, photo_path);
  const res = await withTenant(ctx, async (db) => {
    const t = await driverTrip(db, ctx, id);
    if (!['in_transit', 'reached'].includes(t.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Trip is ${t.status}; it must be on the road before delivery`);
    }
    if (t.otp_locked_until && new Date(t.otp_locked_until) > new Date()) {
      return { locked: true, until: t.otp_locked_until };
    }
    if (!safeEqualHex(otpHash(t.id, otp), t.otp_hash)) {
      const attempts = t.otp_attempts + 1;
      const lock = attempts >= MAX_OTP_TRIES;
      await db.query(
        `update trips set otp_attempts = $2, otp_locked_until = case when $3 then now() + make_interval(mins => $4) else otp_locked_until end where id = $1`,
        [id, lock ? 0 : attempts, lock, LOCK_MINUTES]);
      await addEvent(db, t, t.status, ctx.userId, lock ? 'Wrong OTP: trip locked' : `Wrong OTP (${attempts}/${MAX_OTP_TRIES})`);
      return { wrong: true, remaining: MAX_OTP_TRIES - attempts, locked: lock };
    }
    const { rows: [u] } = await db.query(
      `update trips set status = 'delivered', delivered_at = now(), receiver_name = $2, pod_photo_path = $3, otp_attempts = 0, otp_locked_until = null
        where id = $1 returning *`, [id, receiver_name, photo_path ?? null]);
    await addEvent(db, t, 'delivered', ctx.userId, `Received by ${receiver_name}`);
    return { trip: u };
  });

  // failures are reported after the transaction committed, so the attempt counter is kept
  if (res.locked && !res.wrong) throw new AppError(429, 'OTP_INVALID', 'Too many wrong attempts. Try again later.', { locked_until: res.until });
  if (res.wrong) {
    throw new AppError(res.locked ? 429 : 422, 'OTP_INVALID',
      res.locked ? `Wrong OTP. Delivery is locked for ${LOCK_MINUTES} minutes.` : `Wrong OTP. ${res.remaining} attempt(s) left.`,
      { remaining: res.remaining });
  }
  const orderId = await syncDispatch(res.trip, 'delivered');
  bus.emit('trip.status_changed', tripEventPayload(res.trip, 'delivered'));
  bus.emit('trip.delivered', { ...tripEventPayload(res.trip, 'delivered'), orderId });
  return { id, status: 'delivered', delivered_at: res.trip.delivered_at };
}

// ---------- freight invoice ----------

export const freightInvoice = (ctx, tripId, { amount, tax_pct, due_days }) =>
  withTenant(ctx, async (db) => {
    const t = await loadTrip(db, tripId, { lock: true });
    if (t.transporter_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'This trip belongs to another transporter');
    if (t.status !== 'delivered') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Raise the freight invoice after delivery');
    if ((await db.query(`select 1 from invoices where trip_id = $1 and kind = 'freight' and status <> 'cancelled'`, [tripId])).rowCount) {
      throw new AppError(409, 'DUPLICATE', 'A freight invoice already exists for this trip');
    }
    const { rows: [d] } = await db.query('select order_id from dispatches where id = $1', [t.dispatch_id]);
    const tax = round2((amount * tax_pct) / 100);
    const invoiceNo = await nextNumber(db, ctx.orgId, 'FRT');
    const { rows: [inv] } = await db.query(
      `insert into invoices (invoice_no, kind, seller_org_id, buyer_org_id, order_id, dispatch_id, trip_id, due_date, subtotal, tax, total, created_by)
       values ($1,'freight',$2,$3,$4,$5,$6, current_date + $7::int, $8,$9,$10,$11) returning *`,
      [invoiceNo, ctx.orgId, t.requester_org_id, d?.order_id ?? null, t.dispatch_id, tripId, due_days, amount, tax, round2(amount + tax), ctx.userId]);
    await db.query(
      `insert into invoice_lines (invoice_id, seller_org_id, buyer_org_id, description, qty, uom, rate, tax_pct, amount)
       values ($1,$2,$3,$4,1,'trip',$5,$6,$5)`,
      [inv.id, ctx.orgId, t.requester_org_id, `Freight ${t.trip_no}`, amount, tax_pct]);
    await db.query('update trips set freight_amount = $2 where id = $1', [tripId, amount]);
    await audit(db, ctx, { action: 'freight_invoice', table: 'invoices', id: inv.id, after: { invoice_no: invoiceNo, total: inv.total } });
    return inv;
  });
