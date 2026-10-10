import { env } from '../../config/env.js';
import { withTenant, withSystem } from '../../db/withTenant.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { newToken, sha256 } from '../../utils/otp.js';
import { audit } from '../../utils/audit.js';
import { paged, where } from '../../utils/paginate.js';
import { bus } from '../../events/bus.js';
import email from '../../utils/email.js';

// relation = what the TARGET is to the REQUESTER. Seen from the other side it flips.
const INVERSE = { buyer: 'supplier', supplier: 'buyer', transporter: 'buyer' };

// org types that can play each relation: a mill is a supplier to buyers and a buyer of yarn suppliers
const COMPATIBLE_TYPES = {
  buyer: ['buyer', 'manufacturer'],
  supplier: ['supplier', 'manufacturer'],
  transporter: ['transporter'],
};

// ---------- helpers shared with other modules ----------

// are two orgs connected (either direction, any relation)?
export async function arePartners(db, a, b) {
  const { rowCount } = await db.query(
    `select 1 from partnerships where status = 'active' and
       ((requester_org_id = $1 and target_org_id = $2) or (requester_org_id = $2 and target_org_id = $1))`,
    [a, b],
  );
  return rowCount > 0;
}

// is `buyerOrg` an active customer of `sellerOrg`?
export async function isBuyerOf(db, buyerOrg, sellerOrg) {
  const { rowCount } = await db.query(
    `select 1 from partnerships where status = 'active' and
       ((requester_org_id = $2 and target_org_id = $1 and relation = 'buyer') or
        (requester_org_id = $1 and target_org_id = $2 and relation = 'supplier'))`,
    [buyerOrg, sellerOrg],
  );
  return rowCount > 0;
}

export async function isSupplierOf(db, supplierOrg, buyerOrg) {
  return isBuyerOf(db, buyerOrg, supplierOrg);
}

// ---------- list ----------

export const listPartners = (ctx) =>
  withTenant(ctx, async (db) => {
    const { rows } = await db.query(
      `select p.id, p.status, p.relation, p.invited_email, p.created_at, p.responded_at,
              (p.requester_org_id = $1) as outgoing,
              case when p.requester_org_id = $1 then p.target_org_id else p.requester_org_id end as partner_org_id,
              o.name as partner_name, o.types as partner_types, o.city as partner_city
         from partnerships p
         left join organizations o on o.id = case when p.requester_org_id = $1 then p.target_org_id else p.requester_org_id end
        where p.requester_org_id = $1 or p.target_org_id = $1
        order by p.created_at desc`,
      [ctx.orgId],
    );
    return rows.map((r) => ({
      ...r,
      // the partner's role relative to me
      my_relation: r.outgoing ? r.relation : INVERSE[r.relation],
    }));
  });

// ---------- connect ----------

export async function connectByCode(ctx, { code, relation }) {
  const p = await withTenant(ctx, async (db) => {
    const { rows: [target] } = await db.query('select * from find_org_by_code($1)', [code]);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'No organization with this connect code');
    if (target.id === ctx.orgId) throw new AppError(422, 'VALIDATION_FAILED', 'You cannot connect to your own organization');
    if (!target.types.some((t) => COMPATIBLE_TYPES[relation].includes(t))) {
      throw new AppError(422, 'VALIDATION_FAILED', `${target.name} cannot be added as your ${relation}`);
    }
    // already connected or pending in either direction?
    const { rows: [dup] } = await db.query(
      `select id, status from partnerships where
         ((requester_org_id = $1 and target_org_id = $2 and relation = $3) or
          (requester_org_id = $2 and target_org_id = $1 and relation = $4))
         and status in ('pending','active','blocked')`,
      [ctx.orgId, target.id, relation, INVERSE[relation]],
    );
    if (dup) throw new AppError(409, 'DUPLICATE', dup.status === 'blocked' ? 'This connection is blocked' : `Already ${dup.status}`);
    const { rows: [row] } = await db.query(
      `insert into partnerships (requester_org_id, target_org_id, relation, created_by) values ($1,$2,$3,$4) returning *`,
      [ctx.orgId, target.id, relation, ctx.userId],
    );
    await audit(db, ctx, { action: 'connect', table: 'partnerships', id: row.id, after: { target: target.id, relation } });
    return { ...row, target_name: target.name };
  });
  bus.emit('partner.requested', { partnershipId: p.id, requesterOrgId: ctx.orgId, targetOrgId: p.target_org_id });
  return p;
}

export const inviteByEmail = (ctx, { email: to, relation }) =>
  withTenant(ctx, async (db) => {
    const token = newToken();
    const { rows: [row] } = await db.query(
      `insert into partnerships (requester_org_id, target_org_id, relation, invited_email, token_hash, created_by)
       values ($1, null, $2, $3, $4, $5) returning id, relation, invited_email, status`,
      [ctx.orgId, relation, to, sha256(token), ctx.userId],
    );
    await audit(db, ctx, { action: 'invite', table: 'partnerships', id: row.id, after: { email: to, relation } });
    const link = `${env.CLIENT_URL}/invite/partner/${token}`;
    email.send({ to, template: 'partner_invite', data: { org_name: ctx.orgName, relation, link } }).catch((e) => console.error('[partner email]', e.message));
    return { ...row, link };
  });

// ---------- respond ----------

async function loadPartnership(db, id) {
  return must((await db.query('select * from partnerships where id = $1 for update', [id])).rows[0], 'Partnership');
}

async function respond(ctx, id, status) {
  const row = await withTenant(ctx, async (db) => {
    const p = await loadPartnership(db, id);
    if (p.target_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'Only the invited organization can respond');
    if (p.status !== 'pending') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Request is already ${p.status}`);
    const { rows: [u] } = await db.query(
      `update partnerships set status = $2, responded_at = now() where id = $1 returning *`, [id, status]);
    await audit(db, ctx, { action: status, table: 'partnerships', id });
    return u;
  });
  if (status === 'active') bus.emit('partner.accepted', { partnershipId: id, requesterOrgId: row.requester_org_id, targetOrgId: ctx.orgId });
  return row;
}

export const acceptPartner = (ctx, id) => respond(ctx, id, 'active');
export const rejectPartner = (ctx, id) => respond(ctx, id, 'rejected');

export const blockPartner = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const p = await loadPartnership(db, id);
    if (p.requester_org_id !== ctx.orgId && p.target_org_id !== ctx.orgId) throw notFound('Partnership');
    const { rows: [u] } = await db.query(
      `update partnerships set status = 'blocked', blocked_by_org_id = $2, responded_at = now() where id = $1 returning *`,
      [id, ctx.orgId]);
    await audit(db, ctx, { action: 'block', table: 'partnerships', id, before: { status: p.status } });
    return u;
  });

// ---------- seller catalog for connected buyers ----------

export async function sellerCatalog(ctx, sellerOrgId) {
  const connected = await withTenant(ctx, (db) => isBuyerOf(db, ctx.orgId, sellerOrgId));
  if (!connected) throw new AppError(403, 'NOT_PARTNERS', 'You are not connected with this organization as a customer');
  // read the seller's items with a system context; only non-cost fields leave this function
  return withSystem(sellerOrgId, async (db) => {
    const { rows } = await db.query(
      `select id, name, kind, colour, composition, gsm, width_m, uom
         from items where active and sellable and kind in ('finished_fabric','grey_fabric','garment') order by name`);
    return rows;
  });
}

// ---------- offline contacts ----------

export const listContacts = (ctx, q) =>
  withTenant(ctx, async (db) => {
    const w = where().raw('org_id = ?', ctx.orgId).add('type = ?', q.type);
    if (q.q) w.raw('(name ilike ? or phone ilike ?)', `%${q.q}%`, `%${q.q}%`);
    const { rows, meta } = await paged(db, `select * from contacts ${w.sql}`, w.params, q, 'name');
    return { data: rows, meta };
  });

export const createContact = (ctx, i) =>
  withTenant(ctx, async (db) => {
    const { rows: [c] } = await db.query(
      `insert into contacts (org_id, type, name, phone, email, gstin, address, city, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [ctx.orgId, i.type, i.name, i.phone ?? null, i.email ?? null, i.gstin ?? null, i.address ?? null, i.city ?? null, ctx.userId]);
    return c;
  });

export const updateContact = (ctx, id, i) =>
  withTenant(ctx, async (db) => {
    const { rows: [c] } = await db.query(
      `update contacts set type = coalesce($2, type), name = coalesce($3, name), phone = coalesce($4, phone),
              email = coalesce($5, email), gstin = coalesce($6, gstin), address = coalesce($7, address), city = coalesce($8, city)
        where id = $1 returning *`,
      [id, i.type ?? null, i.name ?? null, i.phone ?? null, i.email ?? null, i.gstin ?? null, i.address ?? null, i.city ?? null]);
    return must(c, 'Contact');
  });

export const deleteContact = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rowCount } = await db.query('delete from contacts where id = $1', [id]);
    if (!rowCount) throw notFound('Contact');
    return { id };
  });
