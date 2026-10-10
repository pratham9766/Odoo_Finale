// Payments received from buyers against invoices. The invoice moves to partial / paid in the same transaction.

import { withTx } from '../../db/tx.js';
import { Filter, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { formatINR, round2 } from '../../utils/money.js';
import { istParts } from '../../utils/time.js';
import { getInvoice } from './invoices.service.js';

export async function recordPayment(ctx, { invoice_id: invoiceId, amount, mode, ref_no: refNo, paid_at: paidAt }, { at = new Date() } = {}) {
  const today = istParts(at).date;
  if (paidAt && paidAt > today) throw invalid('paid_at', 'A payment cannot be dated in the future');

  await withTx(async (db) => {
    const { rows: [inv] } = await db.query(
      `select * from invoices where id = $1 for update`, [invoiceId]);
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    if (!['unpaid', 'partial'].includes(inv.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Invoice ${inv.invoice_no} is ${inv.status}; payments can only be recorded on unpaid or partly paid invoices`);
    }
    const outstanding = round2(inv.total - inv.paid_amount);
    if (amount > outstanding) throw invalid('amount', `Only ${formatINR(outstanding)} is outstanding on invoice ${inv.invoice_no}`);

    await db.query(
      `insert into payments (invoice_id, amount, mode, ref_no, paid_at, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [inv.id, amount, mode, refNo ?? null, paidAt ?? today, at, ctx.userId]);
    const paid = round2(inv.paid_amount + amount);
    await db.query(`update invoices set paid_amount = $2, status = $3 where id = $1`, [inv.id, paid, paid >= inv.total ? 'paid' : 'partial']);
    return inv;
  });

  return getInvoice(ctx, invoiceId);
}

/** Payments received from buyers. → { rows, total } */
export function listPayments(ctx, { from, to, page = 1, limit = 100 } = {}) {
  return withTx(async (db) => {
    const f = new Filter();
    if (from) f.where('p.paid_at >= ?', from);
    if (to) f.where('p.paid_at <= ?', to);
    const { rows } = await db.query(
      `select p.*, i.invoice_no, c.name as counterparty
         from payments p join invoices i on i.id = p.invoice_id
         left join contacts c on c.id = i.buyer_contact_id
        where ${f.sql} order by p.paid_at desc, p.created_at desc limit $${f.params.length + 1} offset $${f.params.length + 2}`,
      [...f.params, limit, (page - 1) * limit]);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from payments p where ${f.sql}`, f.params);
    return { rows, total: n };
  });
}
