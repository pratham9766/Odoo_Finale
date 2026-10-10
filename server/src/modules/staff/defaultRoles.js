// Default role -> permission bundles per org type (overall plan §9). Applied when an org is created;
// the owner can edit them afterwards. Owner always gets every permission relevant to the org type.

const ALL = '*';

const VIEW_OPS = ['stock.view', 'orders.view', 'production.view', 'bom.view'];

export const ROLE_DEFS = {
  manufacturer: [
    { name: 'Owner', rank: 100, perms: ALL },
    {
      name: 'General Manager', rank: 90,
      perms: [
        'staff.view', 'staff.invite', 'staff.edit_role', 'settings.manage', 'partners.view', 'partners.connect',
        'partners.approve', 'items.view', 'items.manage', 'bom.view', 'bom.manage', 'stock.view', 'receipt.create',
        'stock.adjust', 'stock.adjust_approve', 'po.view', 'po.create', 'po.approve', 'orders.view', 'orders.create',
        'orders.confirm', 'orders.cancel', 'production.view', 'production.plan', 'production.log', 'machine.status',
        'assignment.manage', 'breakdown.report', 'breakdown.close', 'qc.view', 'gate.view', 'gate.log', 'dispatch.view',
        'dispatch.create', 'dispatch.confirm', 'workers.manage', 'attendance.view', 'attendance.mark',
        'attendance.approve', 'reports.production', 'reports.qc', 'reports.attendance', 'invoice.view', 'ai.chat',
      ],
    },
    {
      name: 'Accountant', rank: 70,
      perms: [
        'partners.view', 'stock.view', 'po.view', 'orders.view', 'orders.view_price', 'dispatch.view',
        'invoice.view', 'invoice.create', 'payment.record', 'bill.manage', 'expense.manage', 'attendance.view',
        'wages.view', 'wages.pay', 'reports.cost', 'reports.pnl', 'ai.chat', 'ai.chat_finance',
      ],
    },
    {
      name: 'Production Manager', rank: 80,
      perms: [
        'items.view', 'bom.view', 'bom.manage', 'stock.view', 'po.view', 'orders.view', 'production.view',
        'production.plan', 'production.log', 'machine.status', 'assignment.manage', 'breakdown.report',
        'breakdown.close', 'qc.view', 'dispatch.view', 'attendance.view', 'settings.manage',
        'reports.production', 'ai.chat',
      ],
    },
    {
      name: 'Shift Supervisor', rank: 60,
      perms: [
        ...VIEW_OPS, 'production.plan', 'production.log', 'machine.status', 'assignment.manage', 'breakdown.report',
        'breakdown.close', 'qc.view', 'attendance.view', 'attendance.mark', 'reports.production', 'ai.chat',
      ],
    },
    { name: 'QC Head', rank: 60, perms: ['orders.view', 'qc.view', 'qc.inspect', 'qc.override', 'settings.manage', 'reports.qc', 'ai.chat'] },
    { name: 'Purchase Officer', rank: 50, perms: ['partners.view', 'partners.connect', 'items.view', 'bom.view', 'stock.view', 'po.view', 'po.create', 'orders.view', 'orders.view_price', 'invoice.view', 'ai.chat'] },
    { name: 'Sales Coordinator', rank: 50, perms: ['partners.view', 'partners.connect', 'items.view', 'bom.view', 'stock.view', 'orders.view', 'orders.create', 'orders.confirm', 'orders.view_price', 'production.view', 'qc.view', 'dispatch.view', 'dispatch.create', 'invoice.view', 'invoice.create', 'ai.chat'] },
    { name: 'HR Clerk', rank: 50, perms: ['workers.manage', 'attendance.view', 'attendance.mark', 'attendance.approve', 'wages.view', 'wages.run', 'settings.manage', 'reports.attendance', 'ai.chat'] },
    { name: 'Store Keeper', rank: 40, perms: ['items.view', 'bom.view', 'stock.view', 'receipt.create', 'stock.adjust', 'po.view', 'orders.view', 'gate.view', 'ai.chat'] },
    { name: 'Dispatch In-charge', rank: 40, perms: ['partners.view', 'stock.view', 'orders.view', 'qc.view', 'gate.view', 'dispatch.view', 'dispatch.create', 'dispatch.confirm', 'ai.chat'] },
    { name: 'QC Inspector', rank: 40, perms: ['qc.view', 'qc.inspect'] },
    { name: 'Maintenance Technician', rank: 30, perms: ['production.view', 'breakdown.report', 'maintenance.fix'] },
    { name: 'Machine Operator', rank: 20, perms: ['production.view', 'production.log', 'machine.status', 'breakdown.report'] },
    { name: 'Gate Security', rank: 20, perms: ['gate.log', 'gate.view'] },
  ],
  buyer: [
    { name: 'Owner', rank: 100, perms: ALL },
    { name: 'Purchase Manager', rank: 70, perms: ['partners.view', 'partners.connect', 'partners.approve', 'orders.view', 'orders.create', 'orders.cancel', 'orders.view_price', 'dispatch.view', 'staff.view', 'staff.invite', 'ai.chat'] },
    { name: 'Store / Receiving', rank: 40, perms: ['orders.view', 'dispatch.view', 'receipt.create', 'stock.view'] },
    { name: 'Accounts', rank: 60, perms: ['orders.view', 'orders.view_price', 'invoice.view', 'payment.record', 'expense.manage', 'ai.chat', 'ai.chat_finance'] },
  ],
  supplier: [
    { name: 'Owner', rank: 100, perms: ALL },
    { name: 'Sales / Dispatch', rank: 60, perms: ['partners.view', 'partners.approve', 'items.view', 'items.manage', 'po.view', 'po.respond', 'dispatch.view', 'dispatch.create', 'dispatch.confirm', 'orders.view_price', 'staff.view', 'staff.invite'] },
    { name: 'Accounts', rank: 60, perms: ['po.view', 'orders.view_price', 'invoice.view', 'invoice.create', 'payment.record', 'ai.chat', 'ai.chat_finance'] },
  ],
  transporter: [
    { name: 'Owner', rank: 100, perms: ALL },
    { name: 'Fleet Manager', rank: 70, perms: ['partners.view', 'partners.approve', 'transport.manage', 'dispatch.view', 'staff.view', 'staff.invite'] },
    { name: 'Driver', rank: 20, perms: ['trip.drive'] },
    { name: 'Accounts', rank: 60, perms: ['invoice.view', 'invoice.create', 'payment.record', 'orders.view_price', 'ai.chat_finance'] },
  ],
};

// which permission domains make sense per org type (the Owner gets all of these)
const TYPE_DOMAINS = {
  manufacturer: ['staff', 'settings', 'partners', 'catalog', 'inventory', 'procurement', 'orders', 'production',
    'maintenance', 'quality', 'gate', 'dispatch', 'finance', 'workforce', 'reports', 'ai'],
  buyer: ['staff', 'partners', 'orders', 'dispatch', 'inventory', 'finance', 'ai'],
  supplier: ['staff', 'partners', 'catalog', 'procurement', 'dispatch', 'finance', 'ai'],
  transporter: ['staff', 'partners', 'transport', 'dispatch', 'finance', 'ai'],
};

// returns [{ name, rank, perms:Set<string> }] for the given org types, merged by role name
export function defaultRolesFor(types, allPermissions) {
  const byName = new Map();
  for (const type of types) {
    const domains = new Set(TYPE_DOMAINS[type] ?? []);
    for (const def of ROLE_DEFS[type] ?? []) {
      const perms =
        def.perms === ALL
          ? allPermissions.filter((p) => domains.has(p.domain)).map((p) => p.key)
          : def.perms;
      const cur = byName.get(def.name) ?? { name: def.name, rank: def.rank, perms: new Set() };
      cur.rank = Math.max(cur.rank, def.rank);
      for (const p of perms) cur.perms.add(p);
      byName.set(def.name, cur);
    }
  }
  // Owner of a multi-type org needs every permission of every type
  const owner = byName.get('Owner');
  if (owner) {
    owner.perms.add('roles.manage');
    owner.perms.add('staff.view');
  }
  return [...byName.values()];
}

/**
 * Contract (seed + onboarding): create the default roles and their permissions for an org.
 * `db` must run with app_org() = orgId (withTenant) or bypass RLS (the seed's migration role).
 * @returns {Promise<Map<string, string>>} role name → role id
 */
export async function createDefaultRoles(db, orgId, types) {
  const { rows: perms } = await db.query('select key, domain from permissions');
  const ids = new Map();
  for (const def of defaultRolesFor(types, perms)) {
    const { rows: [r] } = await db.query(
      `insert into roles (org_id, name, rank, is_system) values ($1,$2,$3,true) returning id`, [orgId, def.name, def.rank]);
    ids.set(def.name, r.id);
    if (def.perms.size) {
      await db.query(
        `insert into role_permissions (role_id, permission_key, org_id) select $1, k, $2 from unnest($3::text[]) k`,
        [r.id, orgId, [...def.perms]]);
    }
  }
  return ids;
}
