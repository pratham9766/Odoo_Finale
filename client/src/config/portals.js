// Determines where a user lands after login based on org type + role
// Explicit permission checks take precedence over role-name string fallbacks

export function homeFor(org, role, permissions) {
  if (!org) return '/onboarding';

  const t = org.types ?? [];
  const perms = permissions instanceof Set ? permissions : new Set(permissions ?? []);

  // Multi-type: prefer manufacturer portal for mill staff
  if (t.includes('manufacturer')) {
    // Floor roles go to floor portal
    if (perms.has('production.log') && !perms.has('production.plan')) return '/floor/machine';
    if (perms.has('qc.inspect') && !perms.has('qc.view')) return '/floor/qc';
    if (perms.has('gate.log') && !perms.has('gate.view')) return '/floor/gate';
    if (perms.has('maintenance.fix') && !perms.has('production.view')) return '/floor/maintenance';
    if (perms.has('assignment.manage') && !perms.has('production.plan')) return '/floor/supervisor';
    return '/app/dashboard';
  }

  if (t.includes('transporter')) {
    return perms.has('trip.drive') && !perms.has('transport.manage')
      ? '/driver/trips'
      : '/transport/trips';
  }

  if (t.includes('supplier')) return '/supplier/pos';
  if (t.includes('buyer'))    return '/buyer/orders';

  return '/app/dashboard';
}
