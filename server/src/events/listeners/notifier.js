import { on } from '../bus.js';
import { withTx } from '../../db/tx.js';
import { notify } from '../../modules/notifications/notify.js';

// In-app notifications for the mill's staff.
export function registerNotifier() {
  on('stock.low', ({ itemId, itemName, available, reorderLevel }) =>
    withTx((db) => notify(db, {
      requiredPermission: 'stock.view', type: 'stock.low', title: `Low stock: ${itemName}`,
      body: `Available ${available}, reorder level ${reorderLevel}`, link: `/app/inventory/stock?item=${itemId}`,
    })));
}
