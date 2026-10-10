import {
  DashboardOutlined, ShoppingCartOutlined, InboxOutlined,
  ToolOutlined, BarChartOutlined, TeamOutlined,
  BankOutlined, PartitionOutlined, CarOutlined,
  CheckSquareOutlined, SettingOutlined,
} from '@ant-design/icons';

// nav.mill.js — Single Mill office navigation
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
    anyOf: ['stock.view', 'receipt.create'],
    children: [
      { key: 'stock',     label: 'Stock',          to: '/app/inventory/stock',    anyOf: ['stock.view'] },
      { key: 'receipts',  label: 'Goods receipts', to: '/app/inventory/receipts', anyOf: ['receipt.create', 'stock.view'] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    icon: PartitionOutlined,
    anyOf: ['production.view', 'assignment.manage'],
    children: [
      { key: 'board',       label: 'Machine board', to: '/app/production/board',       anyOf: ['production.view'] },
      { key: 'work-orders', label: 'Work orders',   to: '/app/production/work-orders', anyOf: ['production.view'] },
      { key: 'assign',      label: 'Assignments',   to: '/app/production/assignments', anyOf: ['assignment.manage'] },
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
    key: 'dispatch',
    label: 'Dispatch',
    icon: CarOutlined,
    to: '/app/dispatch',
    anyOf: ['dispatch.view', 'dispatch.create'],
  },
  {
    key: 'workforce',
    label: 'Workforce',
    icon: TeamOutlined,
    anyOf: ['attendance.view', 'workers.manage', 'wages.view'],
    children: [
      { key: 'today',   label: 'Attendance today', to: '/app/workforce/attendance/today', anyOf: ['attendance.view'] },
      { key: 'workers', label: 'Workers',          to: '/app/workforce/workers',          anyOf: ['workers.manage'] },
      { key: 'wages',   label: 'Wages',            to: '/app/workforce/wages',            anyOf: ['wages.view'] },
    ],
  },
  {
    key: 'finance',
    label: 'Accounts',
    icon: BankOutlined,
    anyOf: ['invoice.view', 'payment.record', 'expense.manage'],
    children: [
      { key: 'invoices', label: 'Sales invoices',   to: '/app/finance/invoices', anyOf: ['invoice.view'] },
      { key: 'bills',    label: 'Bills & expenses', to: '/app/finance/bills',    anyOf: ['expense.manage', 'invoice.view'] },
      { key: 'payments', label: 'Payments',         to: '/app/finance/payments', anyOf: ['payment.record', 'invoice.view'] },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: BarChartOutlined,
    anyOf: ['reports.cost', 'reports.pnl', 'reports.production'],
    children: [
      { key: 'cost',     label: 'Cost per order',     to: '/app/reports/order-cost', anyOf: ['reports.cost'] },
      { key: 'pnl',      label: 'Monthly P&L',        to: '/app/reports/pnl',        anyOf: ['reports.pnl'] },
      { key: 'machines', label: 'Machine production', to: '/app/reports/machines',   anyOf: ['reports.production'] },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: SettingOutlined,
    to: '/app/settings/machines',
    anyOf: ['production.view', 'settings.manage', 'staff.view', 'roles.manage'],
    children: [
      { key: 'staff',    label: 'Staff',                to: '/app/settings/staff',    anyOf: ['staff.view'] },
      { key: 'roles',    label: 'Roles & permissions',  to: '/app/settings/roles',    anyOf: ['roles.manage'] },
      { key: 'machines', label: 'Machines', to: '/app/settings/machines', anyOf: ['production.view'] },
      { key: 'planning', label: 'Planning', to: '/app/settings/planning', anyOf: ['production.plan'] },
    ],
  },
];

// nav.floor.js — Floor/tablet navigation (4 screens)
export const floorNav = [
  { key: 'machine',    label: 'Machine',    icon: ToolOutlined,         to: '/floor/machine',    anyOf: ['production.log'] },
  { key: 'supervisor', label: 'Supervisor', icon: TeamOutlined,         to: '/floor/supervisor', anyOf: ['assignment.manage'] },
  { key: 'qc',         label: 'QC',         icon: CheckSquareOutlined,  to: '/floor/qc',         anyOf: ['qc.inspect'] },
  { key: 'dispatch',   label: 'Dispatch',   icon: CarOutlined,          to: '/floor/dispatch',   anyOf: ['dispatch.create'] },
];
