import { on, emit } from '../bus.js';
import { withTx } from '../../db/tx.js';
import { lowStockAmong } from '../../modules/inventory/inventory.core.js';
import { recheckWaitingOrders } from '../../modules/orders/orders.service.js';

export function register() {
  on('grn.posted', async ({ grnNo, itemIds, value }) => {
    // 1) the supplier's bill is recorded as a draft expense (counted as payable, excluded from the P&L)
    if (value > 0) {
      await withTx((db) =>
        db.query(
          `insert into expenses (category, amount, date, note, paid) values ('supplier_bill',$1,current_date,$2,false)`,
          [Math.round(value * 100) / 100, `GRN ${grnNo}`]));
    }
    // 2) waiting orders get first claim on the new stock
    await recheckWaitingOrders();
    // 3) anything still below reorder level after that raises stock.low
    const low = await withTx((db) => lowStockAmong(db, itemIds));
    for (const i of low) {
      emit('stock.low', { itemId: i.item_id, itemName: i.name, available: i.available, reorderLevel: i.reorder_level });
    }
  });
}
