// The six default roles of a mill. Applied when the mill is created; the owner can edit them afterwards.
// Owner always gets every permission.

const ALL = '*';

export const ROLE_DEFS = [
  { name: 'Owner', rank: 100, perms: ALL },
  {
    // sales + accounts: buyers, orders, invoices, payments, bills, wages, money reports
    name: 'Office', rank: 70,
    perms: [
      'staff.view', 'contacts.view', 'contacts.manage', 'items.view', 'bom.view', 'stock.view',
      'po.view', 'po.create', 'po.approve', 'orders.view', 'orders.create', 'orders.confirm', 'orders.cancel', 'orders.view_price',
      'production.view', 'qc.view', 'dispatch.view', 'invoice.view', 'invoice.create', 'payment.record', 'bill.manage',
      'expense.manage', 'attendance.view', 'wages.view', 'wages.run', 'wages.pay',
      'reports.production', 'reports.qc', 'reports.attendance', 'reports.cost', 'reports.pnl',
    ],
  },
  {
    // raw material in (GRN), finished rolls out (dispatch)
    name: 'Store Keeper', rank: 40,
    perms: [
      'contacts.view', 'items.view', 'bom.view', 'stock.view', 'receipt.create', 'stock.adjust', 'po.view', 'orders.view',
      'qc.view', 'dispatch.view', 'dispatch.create', 'dispatch.confirm',
    ],
  },
  {
    // runs the floor: plans work, assigns workers to machines, breakdowns, attendance
    name: 'Supervisor', rank: 60,
    perms: [
      'items.view', 'bom.view', 'stock.view', 'orders.view', 'production.view', 'production.plan', 'production.log',
      'machine.status', 'assignment.manage', 'breakdown.report', 'breakdown.close', 'maintenance.fix', 'qc.view',
      'workers.manage', 'attendance.view', 'attendance.mark', 'attendance.approve', 'reports.production',
    ],
  },
  { name: 'Operator', rank: 20, perms: ['production.view', 'production.log', 'machine.status', 'breakdown.report'] },
  { name: 'QC Inspector', rank: 40, perms: ['production.view', 'qc.view', 'qc.inspect'] },
];

// returns [{ name, rank, perms:Set<string> }]
export function defaultRolesFor(allPermissions) {
  return ROLE_DEFS.map((def) => ({
    name: def.name,
    rank: def.rank,
    perms: new Set(def.perms === ALL ? allPermissions.map((p) => p.key) : def.perms),
  }));
}

/**
 * Create the default roles and their permissions for a mill.
 * @returns {Promise<Map<string, string>>} role name → role id
 */
export async function createDefaultRoles(db) {
  const { rows: perms } = await db.query('select key from permissions');
  const ids = new Map();
  for (const def of defaultRolesFor(perms)) {
    const { rows: [r] } = await db.query(
      `insert into roles (name, rank, is_system) values ($1,$2,true) returning id`, [def.name, def.rank]);
    ids.set(def.name, r.id);
    if (def.perms.size) {
      await db.query(
        `insert into role_permissions (role_id, permission_key) select $1, k from unnest($2::text[]) k`,
        [r.id, [...def.perms]]);
    }
  }
  return ids;
}
