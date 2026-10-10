// Payments against invoices (backend plan §10.11). Either party records one: the seller "received", the buyer "paid".
// The invoice moves to partial / paid in the same transaction; the other side hears about it after commit (financeReactions.js).

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { Filter, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { formatINR, round2 } from '../../utils/money.js';
import { istParts } from '../../utils/time.js';
import { getInvoice } from './invoices.service.js';

export async function recordPayment(ctx, { invoice_id: invoiceId, amount, mode, ref_no: refNo, paid_at: paidAt }, { at = new Date() } = {}) {
  const today = istParts(at).date;
  if (paidAt && paidAt > today) throw invalid('paid_at', 'A payment cannot be dated in the future');

  const invoice = await withTenant(ctx, async (db) => {
    const { rows: [inv] } = await db.query(
      `select * from invoices where id = $1 and (seller_org_id = $2 or buyer_org_id = $2) for update`, [invoiceId, ctx.orgId]);
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    if (!['unpaid', 'partial'].includes(inv.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Invoice ${inv.invoice_no} is ${inv.status}; payments can only be recorded on unpaid or partly paid invoices`);
    }
    const outstanding = round2(inv.total - inv.paid_amount);
    if (amount > outstanding) throw invalid('amount', `Only ${formatINR(outstanding)} is outstanding on invoice ${inv.invoice_no}`);

    await db.query(
      `insert into payments (invoice_id, seller_org_id, buyer_org_id, amount, mode, ref_no, paid_at, recorded_by_org_id, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [inv.id, inv.seller_org_id, inv.buyer_org_id, amount, mode, refNo ?? null, paidAt ?? today, ctx.orgId, at, ctx.userId]);
    const paid = round2(inv.paid_amount + amount);
    await db.query(`update invoices set paid_amount = $2, status = $3 where id = $1`, [inv.id, paid, paid >= inv.total ? 'paid' : 'partial']);
    return inv;
  });

  bus.emit('payment.recorded', {
    invoiceId, sellerOrgId: invoice.seller_org_id, buyerOrgId: invoice.buyer_org_id, recordedByOrgId: ctx.orgId, amount,
  });
  return getInvoice(ctx, invoiceId);
}

/** Payments we received (`side: 'in'`, as seller) or made (`'out'`, as buyer). → { rows, total } */
export function listPayments(ctx, { side = 'in', from, to, page = 1, limit = 100 } = {}) {
  return withTenant(ctx, async (db) => {
    const f = new Filter(ctx.orgId, 'p', side === 'out' ? 'buyer_org_id' : 'seller_org_id');
    if (from) f.where('p.paid_at >= ?', from);
    if (to) f.where('p.paid_at <= ?', to);
    const { rows } = await db.query(
      `select p.*, i.invoice_no, i.kind, coalesce(o.name, c.name) as counterparty
         from payments p join invoices i on i.id = p.invoice_id
         left join organizations o on o.id = case when p.seller_org_id = $1 then p.buyer_org_id else p.seller_org_id end
         left join contacts c on c.id = i.buyer_contact_id
        where ${f.sql} order by p.paid_at desc, p.created_at desc limit $${f.params.length + 1} offset $${f.params.length + 2}`,
      [...f.params, limit, (page - 1) * limit]);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from payments p where ${f.sql}`, f.params);
    return { rows, total: n };
  });
}
