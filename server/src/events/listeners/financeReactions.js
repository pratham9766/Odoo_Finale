// Finance's reactions (backend plan §12): payment.recorded tells the other side of the invoice.

import { withSystem } from '../../db/withTenant.js';
import { notify } from '../../modules/notifications/notifications.service.js';
import { formatINR } from '../../utils/money.js';
import { on } from '../bus.js';

/** The party that did NOT record the payment is told: the buyer paid → the seller hears "received", and the other way round. */
async function onPayment({ invoiceId, sellerOrgId, buyerOrgId, recordedByOrgId, amount }) {
  const recordedBySeller = recordedByOrgId === sellerOrgId;
  const other = recordedBySeller ? buyerOrgId : sellerOrgId;
  if (!other) return;                                                    // an offline buyer has no organization to tell

  await withSystem(other, async (db) => {
    const { rows: [inv] } = await db.query(`select invoice_no, status from invoices where id = $1`, [invoiceId]);
    await notify(db, {
      orgId: other, requiredPermission: 'invoice.view', type: recordedBySeller ? 'payment.acknowledged' : 'payment.received',
      link: `/app/finance/invoices/${invoiceId}`,
      title: recordedBySeller ? `Payment of ${formatINR(amount)} recorded on ${inv.invoice_no}` : `${formatINR(amount)} received against ${inv.invoice_no}`,
      body: inv.status === 'paid' ? 'The invoice is now fully paid.' : null,
    });
  });
}

/** Called once by events/listeners/index.js at boot. */
export function registerFinanceReactions() {
  on('payment.recorded', onPayment);
}
