// Buyers and suppliers: list, create, update and delete (a contact in use cannot be deleted).
import { withTx } from '../../db/tx.js';
import { must, notFound } from '../../utils/errors.js';
import { paged, where } from '../../utils/paginate.js';

// Buyers and suppliers of the mill: names on orders, GRNs and invoices.

export const listContacts = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('type = ?', q.type);
    if (q.q) w.raw('(name ilike ? or phone ilike ?)', `%${q.q}%`, `%${q.q}%`);
    const { rows, meta } = await paged(db, `select * from contacts ${w.sql}`, w.params, q, 'name');
    return { data: rows, meta };
  });

export const createContact = (ctx, i) =>
  withTx(async (db) => {
    const { rows: [c] } = await db.query(
      `insert into contacts (type, name, phone, email, gstin, address, city, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [i.type, i.name, i.phone ?? null, i.email ?? null, i.gstin ?? null, i.address ?? null, i.city ?? null, ctx.userId]);
    return c;
  });

export const updateContact = (ctx, id, i) =>
  withTx(async (db) => {
    const { rows: [c] } = await db.query(
      `update contacts set type = coalesce($2, type), name = coalesce($3, name), phone = coalesce($4, phone),
              email = coalesce($5, email), gstin = coalesce($6, gstin), address = coalesce($7, address), city = coalesce($8, city)
        where id = $1 returning *`,
      [id, i.type ?? null, i.name ?? null, i.phone ?? null, i.email ?? null, i.gstin ?? null, i.address ?? null, i.city ?? null]);
    return must(c, 'Contact');
  });

export const deleteContact = (ctx, id) =>
  withTx(async (db) => {
    const { rowCount } = await db.query('delete from contacts where id = $1', [id]);
    if (!rowCount) throw notFound('Contact');
    return { id };
  });
