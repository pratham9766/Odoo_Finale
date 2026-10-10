import { on, emit } from '../bus.js';
import { withSystem } from '../../db/withTenant.js';
import { lowStockAmong } from '../../modules/inventory/inventory.core.js';
import { recheckWaitingOrders } from '../../modules/orders/orders.service.js';

export function register() {
  on('grn.posted', async ({ orgId, grnNo, itemIds, value, offlineSupplier }) => {
    // 1) offline supplier: the mill records the bill itself as a draft expense (counted as payable, excluded from P&L)
    if (offlineSupplier && value > 0) {
      await withSystem(orgId, (db) =>
        db.query(
          `insert into expenses (org_id, category, amount, date, note, paid) values ($1,'supplier_bill',$2,current_date,$3,false)`,
          [orgId, Math.round(value * 100) / 100, `GRN ${grnNo}`]));
    }
    // 2) waiting orders get first claim on the new stock
    await recheckWaitingOrders(orgId);
    // 3) anything still below reorder level after that raises stock.low
    const low = await withSystem(orgId, (db) => lowStockAmong(db, itemIds));
    for (const i of low) {
      emit('stock.low', { orgId, itemId: i.item_id, itemName: i.name, available: i.available, reorderLevel: i.reorder_level });
    }
  });
}
