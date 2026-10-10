// Receivables (buyers owe us) and payables (we owe suppliers), with ageing.
// Ageing buckets count days PAST DUE: "0-30" is everything not yet due or up to 30 days late.

import { withTx } from '../../db/tx.js';
import { round2 } from '../../utils/money.js';
import { daysBetween, monthStart, todayIST } from '../../utils/time.js';
import { PAYMENT_TERMS_DAYS } from './invoicing.service.js';

export const bucketOf = (daysOverdue) => (daysOverdue <= 30 ? '0-30' : daysOverdue <= 60 ? '31-60' : '60+');

/** @param {Array<{ outstanding: number, days_overdue: number }>} rows  → { '0-30': { count, amount }, '31-60': ..., '60+': ... } */
export function ageing(rows) {
  const buckets = { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '60+': { count: 0, amount: 0 } };
  for (const r of rows) {
    const b = buckets[bucketOf(r.days_overdue)];
    b.count++;
    b.amount = round2(b.amount + Number(r.outstanding));
  }
  return buckets;
}

function summarise(rows, collected) {
  const overdue = rows.filter((r) => r.days_overdue > 0);
  const sum = (list) => round2(list.reduce((n, r) => n + Number(r.outstanding), 0));
  return {
    kpis: { invoices: rows.length, outstanding: sum(rows), overdue: sum(overdue), overdue_invoices: overdue.length, collected_this_month: round2(collected) },
    ageing: ageing(rows),
    rows,
  };
}

/** Rows get `days_overdue` (0 when not yet due). */
const withDaysOverdue = (rows, today) => rows.map((r) => ({ ...r, days_overdue: Math.max(0, daysBetween(String(r.due_date).slice(0, 10), today)) }));

/** What buyers owe us: unpaid and partly paid sales invoices. */
export function receivables(ctx) {
  const today = todayIST();
  return withTx(async (db) => {
    const { rows } = await db.query(
      `select r.invoice_id, r.invoice_no, bc.name as party, r.total, r.paid_amount, r.outstanding, r.due_date
         from v_receivables r left join contacts bc on bc.id = r.buyer_contact_id
        order by r.due_date, r.invoice_no`);
    const { rows: [paid] } = await db.query(
      `select coalesce(sum(amount), 0) as n from payments where paid_at >= $1::date`, [monthStart(today)]);
    return summarise(withDaysOverdue(rows, today), paid.n);
  });
}

/** What we owe: unpaid supplier bills (expenses with category 'supplier_bill'). */
export function payables(ctx) {
  const today = todayIST();
  return withTx(async (db) => {
    const { rows: bills } = await db.query(
      `select null::uuid as invoice_id, coalesce(note, 'Supplier bill') as invoice_no, 'supplier_bill' as kind, coalesce(note, 'Supplier') as party,
              amount as total, 0 as paid_amount, amount as outstanding, (date + $1::int) as due_date
         from expenses where category = 'supplier_bill' and not paid order by date`, [PAYMENT_TERMS_DAYS]);
    const { rows: [paid] } = await db.query(
      `select coalesce(sum(amount), 0) as n from expenses where category = 'supplier_bill' and paid and date >= $1::date`, [monthStart(today)]);
    return summarise(withDaysOverdue(bills, today), paid.n);
  });
}
