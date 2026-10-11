// The mobile menu, mirroring the web sidebar (client/src/layouts/AppLayout.jsx NAV). An entry shows when the person
// holds any one of its permissions; `perms: null` = everyone. Screens the phone does not have (finance, wages, reports,
// staff, roles, settings ...) stay on the web app.
export const NAV = [
  { items: [
    { route: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline' },
    { route: 'my-work', label: 'My work', icon: 'account-outline' },
  ] },
  { caption: 'SALES', items: [
    { route: 'orders', label: 'Orders', icon: 'clipboard-list-outline', perms: ['orders.view'] },
  ] },
  { caption: 'STORES', items: [
    { route: 'stock', label: 'Inventory', icon: 'package-variant-closed', perms: ['stock.view'] },
    { route: 'receipts', label: 'Goods receipts', icon: 'receipt-text-outline', perms: ['receipt.view', 'receipt.create'] },
  ] },
  { caption: 'PRODUCTION', items: [
    { route: 'machine-board', label: 'Machine board', icon: 'factory', perms: ['production.view'] },
    { route: 'work-orders', label: 'Work orders', icon: 'clipboard-check-outline', perms: ['production.view'] },
  ] },
  { caption: 'QUALITY & DISPATCH', items: [
    { route: 'qc-queue', label: 'Quality control', icon: 'check-decagram-outline', perms: ['qc.view'] },
    { route: 'trace', label: 'Trace a roll', icon: 'qrcode-scan', perms: ['qc.view'] },
    { route: 'dispatch', label: 'Dispatch', icon: 'truck-delivery-outline', perms: ['dispatch.view'] },
  ] },
  { caption: 'PEOPLE', items: [
    { route: 'attendance', label: 'Attendance', icon: 'calendar-check-outline', perms: ['attendance.view'] },
  ] },
  { caption: 'ACCOUNT', items: [
    { route: 'notifications', label: 'Notifications', icon: 'bell-outline' },
    { route: 'profile', label: 'My profile', icon: 'card-account-details-outline' },
  ] },
];

export const ALL_ROUTES = NAV.flatMap(g => g.items.map(i => i.route));

export const isAllowed = (item, can) => !item.perms || item.perms.some(can);

/** The groups the person may see, with the empty ones dropped. */
export const visibleNav = can =>
  NAV.map(g => ({ ...g, items: g.items.filter(i => isAllowed(i, can)) })).filter(g => g.items.length);

/** Where the person lands after login, like the web's <Home>: office staff on the dashboard, floor staff on their screen. */
export function homeRoute(can) {
  const office = can('orders.view') || can('stock.view') || can('invoice.view') || can('production.plan');
  if (office) return 'dashboard';
  if (can('production.log')) return 'machine-board';
  if (can('qc.inspect')) return 'qc-queue';
  if (can('assignment.create') || can('attendance.mark')) return 'attendance';
  if (can('dispatch.create')) return 'dispatch';
  return 'my-work';
}
