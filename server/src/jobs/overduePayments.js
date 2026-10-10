// Overdue payments (backend plan §14): every morning the accounts team gets one summary, and a connected or offline buyer gets
// a reminder email on the first day overdue and then at 1 / 2 / 4 / 6 / 8 weeks (not every morning: that is how reminders get ignored).

import * as email from '../utils/email.js';
import { formatINR, round2 } from '../utils/money.js';
import { daysBetween, todayIST } from '../utils/time.js';
import { forEachActiveOrg } from './forEachActiveOrg.js';
import { notifyOnceToday } from './notifyOnce.js';

const REMINDER_DAYS = [1, 7, 14, 28, 42, 56];

export const reminderDue = (daysOverdue) => REMINDER_DAYS.includes(daysOverdue) || (daysOverdue > 56 && (daysOverdue - 56) % 28 === 0);

/** Summarise the org's overdue invoices (one notification a day) and say which buyers are due a reminder. */
export async function checkOverdue(db, orgId, today) {
  const { rows } = await db.query(
    `select r.invoice_no, r.outstanding, r.due_date, coalesce(bo.name, bc.name) as buyer, coalesce(bo.email, bc.email) as buyer_email, s.name as seller
       from v_receivables r join organizations s on s.id = r.org_id
       left join organizations bo on bo.id = r.buyer_org_id left join contacts bc on bc.id = r.buyer_contact_id
      where r.overdue order by r.due_date`);
  const overdue = rows.map((r) => ({ ...r, days_overdue: daysBetween(String(r.due_date).slice(0, 10), today) }));
  if (overdue.length) {
    const total = round2(overdue.reduce((n, r) => n + Number(r.outstanding), 0));
    await notifyOnceToday(db, {
      orgId, requiredPermission: 'invoice.view', type: 'payment.overdue', link: '/app/finance/receivables',
      title: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue, ${formatINR(total)}`,
      body: overdue.slice(0, 3).map((r) => `${r.buyer} ${formatINR(r.outstanding)} (${r.days_overdue} d)`).join(', '),
    });
  }
  return overdue;
}

async function run(now = new Date()) {
  const today = todayIST(now);
  const { ok } = await forEachActiveOrg('overduePayments', (db, orgId) => checkOverdue(db, orgId, today));
  let reminders = 0;
  for (const { result } of ok) {                                            // mail after the scans have committed
    for (const r of result.filter((x) => x.buyer_email && reminderDue(x.days_overdue))) {
      await email.send({ to: r.buyer_email, template: 'overdue_reminder', data: {
        invoice_no: r.invoice_no, seller_name: r.seller, amount_due: r.outstanding, due_date: r.due_date, days_overdue: r.days_overdue } });
      reminders++;
    }
  }
  return reminders;
}

export const overduePayments = { name: 'overduePayments', schedule: '0 9 * * *', run };
