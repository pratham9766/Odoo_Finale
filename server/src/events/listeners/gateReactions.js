// The gate's reaction (backend plan §12): a supplier's truck at the gate tells the store to expect the goods.

import { withSystem } from '../../db/withTenant.js';
import { notify } from '../../modules/notifications/notifications.service.js';
import { on } from '../bus.js';

/** gate.logged: only a supply vehicle arriving matters to someone else; everything else is just the register. */
async function onLogged({ orgId, direction, purpose, vehicleNo, dispatchId, receiptId }) {
  if (direction !== 'in' || purpose !== 'supply') return;
  await withSystem(orgId, async (db) => {
    const { rows: [d] } = dispatchId ? await db.query(
      `select d.dispatch_no, so.name as supplier, r.grn_no from dispatches d join organizations so on so.id = d.from_org_id
         left join goods_receipts r on r.id = $2 where d.id = $1`, [dispatchId, receiptId]) : { rows: [] };
    await notify(db, {
      orgId, requiredPermission: 'receipt.create', type: 'gate.supply_arrived',
      link: receiptId ? `/app/inventory/receipts/${receiptId}` : '/app/gate',
      title: d ? `Truck ${vehicleNo} from ${d.supplier} is at the gate` : `Truck ${vehicleNo} is at the gate`,
      body: d?.grn_no ? `Draft ${d.grn_no} is ready: check the quantities and post it` : 'No supplier dispatch matched this vehicle: create the receipt by hand',
    });
  });
}

/** Called once by events/listeners/index.js at boot. */
export function registerGateReactions() {
  on('gate.logged', onLogged);
}
