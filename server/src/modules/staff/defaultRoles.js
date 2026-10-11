// Built-in roles. Owner has every permission and is the only system role; the others are a starting set the owner can
// edit or delete in the app (Settings → Roles), and staff join by email invite with one of them.
// Keep the lists in sync with db/migrations/019_default_role_permissions.sql and 020_employee_role.sql (which fill them in
// on an existing database).

const ALL = '*';

export const ROLE_DEFS = [
  { name: 'Owner', rank: 100, system: true, perms: ALL },
  {
    name: 'Office', rank: 70, perms: [
      'orders.view', 'orders.create', 'orders.confirm', 'orders.cancel', 'orders.view_price',
      'contacts.view', 'contacts.create', 'contacts.update',
      'items.view', 'bom.view', 'stock.view', 'receipt.view',
      'po.view', 'po.create', 'po.update',
      'production.view', 'machines.view', 'qc.view',
      'dispatch.view', 'dispatch.confirm',
      'invoice.view', 'invoice.create', 'payment.view', 'payment.create',
      'expense.view', 'expense.create', 'expense.update',
      'workers.view', 'attendance.view', 'wages.view', 'wages.run',
      'staff.view',
      'reports.production', 'reports.qc', 'reports.attendance', 'reports.cost',
    ],
  },
  {
    name: 'Supervisor', rank: 60, perms: [
      'orders.view', 'items.view', 'bom.view', 'stock.view',
      'production.view', 'production.plan', 'production.log', 'machine.status', 'machines.view',
      'assignment.view', 'assignment.create', 'assignment.update', 'assignment.delete',
      'breakdown.report', 'breakdown.close', 'maintenance.fix',
      'qc.view', 'dispatch.view',
      'workers.view', 'attendance.view', 'attendance.mark', 'attendance.approve',
      'reports.production', 'reports.qc', 'reports.attendance',
    ],
  },
  {
    name: 'QC Inspector', rank: 40, perms: [
      'qc.view', 'qc.inspect', 'production.view', 'machines.view', 'breakdown.report', 'reports.qc',
    ],
  },
  {
    name: 'Store Keeper', rank: 40, perms: [
      'orders.view', 'contacts.view', 'items.view', 'bom.view',
      'stock.view', 'stock.adjust', 'receipt.view', 'receipt.create', 'receipt.post',
      'po.view', 'qc.view', 'dispatch.view', 'dispatch.create',
    ],
  },
  {
    name: 'Operator', rank: 20, perms: [
      'production.view', 'production.log', 'machine.status', 'machines.view', 'assignment.view', 'breakdown.report',
    ],
  },
  // a plain employee: no permissions, only their own My work page (attendance, output, payslips) and profile
  { name: 'Employee', rank: 10, perms: [] },
];

// returns [{ name, rank, system, perms:Set<string> }]
export function defaultRolesFor(allPermissions) {
  return ROLE_DEFS.map((def) => ({
    name: def.name,
    rank: def.rank,
    system: !!def.system,
    perms: new Set(def.perms === ALL ? allPermissions.map((p) => p.key) : def.perms),
  }));
}

/**
 * Create the built-in roles and their permissions. Safe to run when some of them already exist (migration
 * 019_default_role_permissions creates most of them): an existing role is reused and only gains permissions, nothing is removed.
 * @returns {Promise<Map<string, string>>} role name → role id
 */
export async function createDefaultRoles(db) {
  const { rows: perms } = await db.query('select key from permissions');
  const ids = new Map();
  for (const def of defaultRolesFor(perms)) {
    const { rows: [r] } = await db.query(
      `insert into roles (name, rank, is_system) values ($1,$2,$3)
       on conflict (name) do update set is_system = roles.is_system or excluded.is_system returning id`, [def.name, def.rank, def.system]);
    ids.set(def.name, r.id);
    if (def.perms.size) {
      await db.query(
        `insert into role_permissions (role_id, permission_key) select $1, k from unnest($2::text[]) k on conflict do nothing`,
        [r.id, [...def.perms]]);
    }
  }
  return ids;
}
