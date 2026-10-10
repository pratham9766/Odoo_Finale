import {
  DashboardOutlined, ShoppingCartOutlined, InboxOutlined,
  ToolOutlined, BarChartOutlined, TeamOutlined,
  BankOutlined, PartitionOutlined, ScanOutlined,
  CarOutlined, CheckSquareOutlined, SettingOutlined,
  SafetyCertificateOutlined, FileTextOutlined,
  RobotOutlined, ApartmentOutlined,
} from '@ant-design/icons';

// nav.mill.js — Mill office navigation
// Each item: key, label, icon, to, anyOf (permissions), children
// Parents are hidden if no child is accessible; children filtered individually

export const millNav = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: DashboardOutlined,
    to: '/app/dashboard',
  },
  {
    key: 'orders',
    label: 'Orders',
    icon: ShoppingCartOutlined,
    to: '/app/orders',
    anyOf: ['orders.view'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: InboxOutlined,
    anyOf: ['stock.view'],
    children: [
      { key: 'stock',     label: 'Stock',             to: '/app/inventory/stock',              anyOf: ['stock.view'] },
      { key: 'receipts',  label: 'Goods receipts',    to: '/app/inventory/receipts',           anyOf: ['receipt.create', 'stock.view'] },
      { key: 'items',     label: 'Items',             to: '/app/catalog/items',                anyOf: ['items.view'] },
      { key: 'bom',       label: 'BOM',               to: '/app/catalog/boms',                 anyOf: ['bom.view'] },
      { key: 'calc',      label: 'Material calculator', to: '/app/catalog/calculator',         anyOf: ['bom.view'] },
      { key: 'adjust',    label: 'Adjustments',       to: '/app/inventory/adjustments',        anyOf: ['stock.adjust'] },
    ],
  },
  {
    key: 'procurement',
    label: 'Purchase',
    icon: FileTextOutlined,
    anyOf: ['po.view'],
    children: [
      { key: 'pos', label: 'Purchase orders', to: '/app/procurement/purchase-orders', anyOf: ['po.view'] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    icon: PartitionOutlined,
    anyOf: ['production.view'],
    children: [
      { key: 'board',    label: 'Machine board',  to: '/app/production/board',        anyOf: ['production.view'] },
      { key: 'planning', label: 'Planning',        to: '/app/production/planning',     anyOf: ['production.plan'] },
      { key: 'wos',      label: 'Work orders',    to: '/app/production/work-orders',  anyOf: ['production.view'] },
      { key: 'assign',   label: 'Assignments',    to: '/app/production/assignments',  anyOf: ['assignment.manage'] },
      { key: 'machines', label: 'Machines',       to: '/app/production/machines',     anyOf: ['production.view'] },
      { key: 'tickets',  label: 'Maintenance',    to: '/app/maintenance/tickets',     anyOf: ['breakdown.report', 'maintenance.fix'] },
    ],
  },
  {
    key: 'quality',
    label: 'Quality',
    icon: CheckSquareOutlined,
    to: '/app/quality',
    anyOf: ['qc.view'],
  },
  {
    key: 'gate',
    label: 'Gate register',
    icon: ScanOutlined,
    to: '/app/gate',
    anyOf: ['gate.view'],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    icon: CarOutlined,
    to: '/app/dispatch',
    anyOf: ['dispatch.view'],
  },
  {
    key: 'workforce',
    label: 'Workforce',
    icon: TeamOutlined,
    anyOf: ['attendance.view', 'workers.manage'],
    children: [
      { key: 'today',    label: 'Attendance today',  to: '/app/workforce/attendance/today',    anyOf: ['attendance.view'] },
      { key: 'register', label: 'Monthly register',  to: '/app/workforce/attendance/register', anyOf: ['attendance.view'] },
      { key: 'workers',  label: 'Workers',           to: '/app/workforce/workers',             anyOf: ['workers.manage'] },
      { key: 'requests', label: 'Leave & corrections', to: '/app/workforce/requests',         anyOf: ['attendance.approve'] },
      { key: 'wages',    label: 'Wages',             to: '/app/workforce/wages',               anyOf: ['wages.view'] },
    ],
  },
  {
    key: 'finance',
    label: 'Accounts',
    icon: BankOutlined,
    anyOf: ['invoice.view'],
    children: [
      { key: 'invoices',    label: 'Sales invoices', to: '/app/finance/invoices',    anyOf: ['invoice.view'] },
      { key: 'bills',       label: 'Bills',          to: '/app/finance/bills',       anyOf: ['invoice.view'] },
      { key: 'payments',    label: 'Payments',       to: '/app/finance/payments',    anyOf: ['invoice.view'] },
      { key: 'expenses',    label: 'Expenses',       to: '/app/finance/expenses',    anyOf: ['expense.manage'] },
      { key: 'receivables', label: 'Receivables',   to: '/app/finance/receivables', anyOf: ['invoice.view'] },
      { key: 'payables',    label: 'Payables',       to: '/app/finance/payables',    anyOf: ['invoice.view'] },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: BarChartOutlined,
    anyOf: ['reports.production', 'reports.qc', 'reports.cost', 'reports.pnl', 'reports.attendance'],
    children: [
      { key: 'cost',     label: 'Cost per order',       to: '/app/reports/order-cost', anyOf: ['reports.cost'] },
      { key: 'pnl',      label: 'Monthly P&L',          to: '/app/reports/pnl',        anyOf: ['reports.pnl'] },
      { key: 'machines', label: 'Machine production',   to: '/app/reports/machines',   anyOf: ['reports.production'] },
      { key: 'wastage',  label: 'Wastage',              to: '/app/reports/wastage',    anyOf: ['reports.production'] },
      { key: 'qcr',      label: 'Quality',              to: '/app/reports/qc',         anyOf: ['reports.qc'] },
      { key: 'att',      label: 'Attendance',           to: '/app/reports/attendance', anyOf: ['reports.attendance'] },
    ],
  },
  {
    key: 'partners',
    label: 'Partners',
    icon: ApartmentOutlined,
    to: '/app/partners',
    anyOf: ['partners.view'],
  },
  {
    key: 'ai',
    label: 'Ask SAMETA AI',
    icon: RobotOutlined,
    to: '/app/ai',
    anyOf: ['ai.chat'],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: SettingOutlined,
    to: '/app/settings/org',
    anyOf: ['settings.manage', 'staff.view', 'roles.manage'],
  },
];

// nav.floor.js — Floor/tablet navigation (bottom bar)
export const floorNav = [
  { key: 'machine',     label: 'Machine',    icon: ToolOutlined,             to: '/floor/machine',           anyOf: ['production.log'] },
  { key: 'supervisor',  label: 'Supervisor', icon: TeamOutlined,             to: '/floor/supervisor',         anyOf: ['assignment.manage'] },
  { key: 'qc',         label: 'QC',         icon: CheckSquareOutlined,      to: '/floor/qc',                anyOf: ['qc.inspect'] },
  { key: 'store',      label: 'Receive',    icon: InboxOutlined,            to: '/floor/store/receive',     anyOf: ['receipt.create'] },
  { key: 'dispatch',   label: 'Dispatch',   icon: CarOutlined,              to: '/floor/dispatch',           anyOf: ['dispatch.create'] },
  { key: 'maintenance',label: 'Maint.',     icon: SafetyCertificateOutlined,to: '/floor/maintenance',       anyOf: ['maintenance.fix'] },
  { key: 'gate',       label: 'Gate',       icon: ScanOutlined,             to: '/floor/gate',               anyOf: ['gate.log'] },
];

// nav.buyer.js
export const buyerNav = [
  { key: 'orders',     label: 'Orders',     icon: ShoppingCartOutlined, to: '/buyer/orders',    anyOf: ['orders.view'] },
  { key: 'deliveries', label: 'Deliveries', icon: CarOutlined,          to: '/buyer/deliveries',anyOf: ['dispatch.view'] },
  { key: 'bills',      label: 'Bills',      icon: BankOutlined,         to: '/buyer/bills',     anyOf: ['invoice.view'] },
  { key: 'mills',      label: 'Mills',      icon: ApartmentOutlined,    to: '/buyer/mills',     anyOf: ['partners.view'] },
];

// nav.admin.js
export const adminNav = [
  { key: 'orgs',          label: 'Organizations', icon: ApartmentOutlined, to: '/admin/orgs' },
  { key: 'usage',         label: 'Usage',          icon: BarChartOutlined,  to: '/admin/usage' },
  { key: 'announcements', label: 'Announcements',  icon: FileTextOutlined,  to: '/admin/announcements' },
];
