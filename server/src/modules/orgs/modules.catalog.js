// Feature modules an org can switch off in Settings → Modules.
// Keys are what routes pass to requireModule('<key>'). Stored in organizations.settings.modules
// as { <key>: false } overrides; a missing key means ON (requireModule checks `!== false`).
// Settings, staff, roles and partners are core and cannot be switched off.
// `types`: org types the module applies to (overall plan §4); others don't see the toggle.

const ALL = ['manufacturer', 'buyer', 'supplier', 'transporter'];

export const MODULES = [
  { key: 'orders',      label: 'Orders and tracking',     types: ['manufacturer', 'buyer'] },
  { key: 'inventory',   label: 'Inventory',               types: ['manufacturer', 'buyer', 'supplier'] },
  { key: 'procurement', label: 'Purchase orders',         types: ['manufacturer', 'supplier'] },
  { key: 'production',  label: 'Production',              types: ['manufacturer'] },
  { key: 'maintenance', label: 'Maintenance',             types: ['manufacturer'] },
  { key: 'quality',     label: 'Quality control',         types: ['manufacturer'] },
  { key: 'gate',        label: 'Gate register',           types: ['manufacturer'] },
  { key: 'dispatch',    label: 'Dispatch and deliveries', types: ['manufacturer', 'buyer', 'supplier'] },
  { key: 'transport',   label: 'Transport and fleet',     types: ['transporter'] },
  { key: 'workforce',   label: 'Workers, attendance and wages', types: ['manufacturer'] },
  { key: 'finance',     label: 'Invoices and payments',   types: ALL },
  { key: 'reports',     label: 'Reports',                 types: ['manufacturer'] },
  { key: 'ai',          label: 'AI assistant',            types: ALL },
];

/** Modules that apply to an org with these types. */
export function modulesFor(orgTypes) {
  return MODULES.filter((m) => m.types.some((t) => orgTypes.includes(t)));
}
