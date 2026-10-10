// Determines where a staff member lands after login based on role & permissions
// Operator → /floor/machine
// QC → /floor/qc
// Supervisor → /floor/supervisor
// Everyone else → /app/dashboard

export function homeFor(role, permissions) {
  const roleName = (typeof role === 'string' ? role : role?.name || '').toLowerCase();
  const perms = permissions instanceof Set ? permissions : new Set(permissions ?? []);

  if (roleName.includes('operator') || (perms.has('production.log') && !perms.has('production.plan') && !perms.has('assignment.manage'))) {
    return '/floor/machine';
  }

  if (roleName.includes('qc') || (perms.has('qc.inspect') && !perms.has('qc.view'))) {
    return '/floor/qc';
  }

  if (roleName.includes('supervisor') || (perms.has('assignment.manage') && !perms.has('production.plan'))) {
    return '/floor/supervisor';
  }

  return '/app/dashboard';
}
