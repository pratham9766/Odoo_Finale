// Which reporting views the assistant may read, per permission (§15.1).
export const VIEW_ACCESS = {
  v_stock: 'stock.view', v_low_stock: 'stock.view', v_stock_days_left: 'stock.view',
  v_finished_stock: 'stock.view',
  v_machine_board: 'production.view', v_production_daily: 'reports.production', v_wastage: 'reports.production',
  v_qc_summary: 'reports.qc', v_defects_by_cause: 'reports.qc',
  v_order_progress: 'orders.view',
  v_attendance_daily: 'reports.attendance',
  v_wages_monthly: 'wages.view',
  v_order_cost: 'reports.cost', v_monthly_pnl: 'reports.pnl',
  v_receivables: 'invoice.view', v_payables: 'invoice.view',
  v_trip_status: 'dispatch.view',
};

// money views need the dedicated finance AI permission on top of the data permission
export const FINANCE_VIEWS = new Set(['v_wages_monthly', 'v_order_cost', 'v_monthly_pnl', 'v_receivables', 'v_payables']);

export const allowedViews = (ctx) =>
  Object.entries(VIEW_ACCESS)
    .filter(([view, perm]) => ctx.permissions.has(perm) && (!FINANCE_VIEWS.has(view) || ctx.permissions.has('ai.chat_finance')))
    .map(([view]) => view);
