// Feature modules the mill can switch off in Settings → Modules.
// Keys are what routes pass to requireModule('<key>'). Stored in organizations.settings.modules
// as { <key>: false } overrides; a missing key means ON (requireModule checks `!== false`).
// Settings, staff and roles are core and cannot be switched off.

export const MODULES = [
  { key: 'orders',      label: 'Orders and tracking' },
  { key: 'inventory',   label: 'Inventory' },
  { key: 'procurement', label: 'Purchase orders' },
  { key: 'production',  label: 'Production' },
  { key: 'maintenance', label: 'Breakdowns' },
  { key: 'quality',     label: 'Quality control' },
  { key: 'dispatch',    label: 'Dispatch' },
  { key: 'workforce',   label: 'Workers, attendance and wages' },
  { key: 'finance',     label: 'Invoices and payments' },
  { key: 'reports',     label: 'Reports' },
];

/** Modules of a mill (kept as a function so callers stay unchanged). */
export function modulesFor() {
  return MODULES;
}
