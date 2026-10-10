// Invoices and bills (backend plan §10.11). One table, two views: what we invoiced (side = sales) and what we were billed (side = purchase).

import { withTenant } from '../../db/withTenant.js';
import { Filter } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { loadParty } from '../orgs/parties.js';
import { createInvoiceFromDispatch } from './invoicing.service.js';

const SELECT = `
  select i.*, so.name as seller, coalesce(bo.name, bc.name) as buyer, o.order_no, d.dispatch_no, (i.total - i.paid_amount) as outstanding
    from invoices i
    join organizations so on so.id = i.seller_org_id
    left join organizations bo on bo.id = i.buyer_org_id left join contacts bc on bc.id = i.buyer_contact_id
    left join orders o on o.id = i.order_id left join dispatches d on d.id = i.dispatch_id`;

const notFound = () => new AppError(404, 'NOT_FOUND', 'Invoice not found');

/** @param {{ side?: 'sales'|'purchase', kind?, status?, page?, limit? }} q  → { rows, total } */
export function listInvoices(ctx, { side = 'sales', kind, status, page = 1, limit = 100 } = {}) {
  return withTenant(ctx, async (db) => {
    const f = new Filter(ctx.orgId, 'i', side === 'purchase' ? 'buyer_org_id' : 'seller_org_id').eq('i.kind', kind).eq('i.status', status);
    const { rows } = await db.query(
      `${SELECT} where ${f.sql} order by i.invoice_date desc, i.invoice_no desc limit $${f.params.length + 1} offset $${f.params.length + 2}`,
      [...f.params, limit, (page - 1) * limit]);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from invoices i where ${f.sql}`, f.params);
    return { rows, total: n };
  });
}

/** An invoice with its lines and payments; visible to the seller and to the buyer. */
export function getInvoice(ctx, id) {
  return withTenant(ctx, async (db) => {
    const { rows: [invoice] } = await db.query(`${SELECT} where i.id = $1 and (i.seller_org_id = $2 or i.buyer_org_id = $2)`, [id, ctx.orgId]);
    if (!invoice) throw notFound();
    const { rows: lines } = await db.query(`select * from invoice_lines where invoice_id = $1 order by description, id`, [id]);
    const { rows: payments } = await db.query(`select * from payments where invoice_id = $1 order by paid_at, created_at`, [id]);
    return { ...invoice, lines, payments };
  });
}

/** Everything pdf.invoice() prints. */
export async function invoicePdfData(ctx, id) {
  const invoice = await getInvoice(ctx, id);
  return withTenant(ctx, async (db) => {
    const { rows: [vehicle] } = invoice.dispatch_id
      ? await db.query(`select vehicle_no from dispatches where id = $1`, [invoice.dispatch_id]) : { rows: [] };
    return {
      invoice, lines: invoice.lines,
      seller: await loadParty(db, { orgId: invoice.seller_org_id }),
      buyer: await loadParty(db, { orgId: invoice.buyer_org_id, contactId: invoice.buyer_contact_id }),
      refs: { order_no: invoice.order_no, dispatch_no: invoice.dispatch_no, vehicle_no: vehicle?.vehicle_no },
    };
  });
}

/** Invoice a confirmed dispatch by hand (confirming normally does it): the dispatch must not already have a live invoice. */
export async function invoiceFromDispatch(ctx, dispatchId, { at = new Date() } = {}) {
  const id = await withTenant(ctx, async (db) => {
    const { rows: [d] } = await db.query(`select * from dispatches where id = $1 and from_org_id = $2 for update`, [dispatchId, ctx.orgId]);
    if (!d) throw new AppError(404, 'NOT_FOUND', 'Dispatch not found');
    if (d.status === 'packing' || d.status === 'cancelled') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Dispatch ${d.dispatch_no} is ${d.status}; confirm it first`);
    const { rowCount } = await db.query(`select 1 from invoices where dispatch_id = $1 and kind = 'sales' and status <> 'cancelled'`, [dispatchId]);
    if (rowCount) throw new AppError(409, 'DUPLICATE', `Dispatch ${d.dispatch_no} already has an invoice`);
    return (await createInvoiceFromDispatch(db, ctx, d, at)).id;
  });
  return getInvoice(ctx, id);
}
