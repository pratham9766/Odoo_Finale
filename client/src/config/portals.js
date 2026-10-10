// Where a staff member lands after login. Roles are made by the owner, so this looks at what the role can do, not its name:
//   records output but does not plan   → /floor/machine
//   inspects fabric, no planning/orders → /floor/qc
//   manages assignments, no planning   → /floor/supervisor
//   everyone else                      → /app/dashboard

export function homeFor(role, permissions) {
  const perms = permissions instanceof Set ? permissions : new Set(permissions ?? []);

  if (perms.has('production.log') && !perms.has('production.plan') && !perms.has('assignment.manage')) {
    return '/floor/machine';
  }

  if (perms.has('qc.inspect') && !perms.has('production.plan') && !perms.has('orders.view')) {
    return '/floor/qc';
  }

  if (perms.has('assignment.manage') && !perms.has('production.plan')) {
    return '/floor/supervisor';
  }

  return '/app/dashboard';
}
