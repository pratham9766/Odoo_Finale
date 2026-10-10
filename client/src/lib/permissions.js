// Permission key constants — keep in sync with backend 017_seed_permissions.sql
// Use these instead of raw strings to catch typos at build time

export const P = {
  // Orders
  ORDERS_VIEW:        'orders.view',
  ORDERS_CREATE:      'orders.create',
  ORDERS_VIEW_PRICE:  'orders.view_price',
  ORDERS_CANCEL:      'orders.cancel',

  // Inventory / stock
  STOCK_VIEW:         'stock.view',
  STOCK_ADJUST:       'stock.adjust',
  RECEIPT_CREATE:     'receipt.create',

  // Items / BOM
  ITEMS_VIEW:         'items.view',
  ITEMS_MANAGE:       'items.manage',
  BOM_VIEW:           'bom.view',
  BOM_MANAGE:         'bom.manage',

  // Purchase orders
  PO_VIEW:            'po.view',
  PO_CREATE:          'po.create',
  PO_RESPOND:         'po.respond',

  // Production
  PRODUCTION_VIEW:    'production.view',
  PRODUCTION_LOG:     'production.log',
  PRODUCTION_PLAN:    'production.plan',
  ASSIGNMENT_MANAGE:  'assignment.manage',

  // Maintenance
  BREAKDOWN_REPORT:   'breakdown.report',
  MAINTENANCE_FIX:    'maintenance.fix',

  // QC
  QC_VIEW:            'qc.view',
  QC_INSPECT:         'qc.inspect',
  QC_OVERRIDE:        'qc.override',

  // Gate
  GATE_LOG:           'gate.log',
  GATE_VIEW:          'gate.view',

  // Dispatch
  DISPATCH_VIEW:      'dispatch.view',
  DISPATCH_CREATE:    'dispatch.create',
  DISPATCH_CONFIRM:   'dispatch.confirm',

  // Transport
  TRANSPORT_MANAGE:   'transport.manage',
  TRIP_DRIVE:         'trip.drive',

  // Workforce
  WORKERS_MANAGE:     'workers.manage',
  ATTENDANCE_VIEW:    'attendance.view',
  ATTENDANCE_MARK:    'attendance.mark',
  ATTENDANCE_APPROVE: 'attendance.approve',
  WAGES_VIEW:         'wages.view',
  WAGES_RUN:          'wages.run',
  WAGES_PAY:          'wages.pay',

  // Finance
  INVOICE_VIEW:       'invoice.view',
  INVOICE_CREATE:     'invoice.create',
  PAYMENT_RECORD:     'payment.record',
  EXPENSE_MANAGE:     'expense.manage',

  // Reports
  REPORTS_PRODUCTION: 'reports.production',
  REPORTS_QC:         'reports.qc',
  REPORTS_COST:       'reports.cost',
  REPORTS_PNL:        'reports.pnl',
  REPORTS_ATTENDANCE: 'reports.attendance',

  // Partners
  PARTNERS_VIEW:      'partners.view',
  PARTNERS_CONNECT:   'partners.connect',
  PARTNERS_APPROVE:   'partners.approve',

  // Staff / Roles / Settings
  STAFF_VIEW:         'staff.view',
  STAFF_INVITE:       'staff.invite',
  STAFF_EDIT_ROLE:    'staff.edit_role',
  ROLES_MANAGE:       'roles.manage',
  SETTINGS_MANAGE:    'settings.manage',

  // AI
  AI_CHAT:            'ai.chat',
};
