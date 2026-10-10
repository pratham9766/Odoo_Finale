import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Alert, Button, Drawer } from 'antd';
import NotificationBell from '@/components/NotificationBell';
import { useSession } from '@/context/Session';

export function LogoWeaveIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 14L22 29M14 7L29 22" stroke="#d0af71" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 29L29 14M7 22L22 7" stroke="#c4a161" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 11L25 25M11 25L25 11" stroke="#d9bd85" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

// An entry shows when the person holds any one of its permissions. `perms: null` = everyone.
const NAV = [
  { items: [{ to: '/app', label: 'Dashboard', end: true }] },
  { caption: 'SALES', items: [
    { to: '/app/orders', label: 'Orders', perms: ['orders.view'] },
    { to: '/app/contacts', label: 'Buyers & suppliers', perms: ['contacts.view'] },
  ] },
  { caption: 'STORES', items: [
    { to: '/app/stock', label: 'Inventory', perms: ['stock.view'] },
    { to: '/app/receipts', label: 'Goods receipts', perms: ['receipt.view', 'receipt.create'] },
    { to: '/app/items', label: 'Items', perms: ['items.view'] },
    { to: '/app/boms', label: 'Recipes (BOM)', perms: ['bom.view'] },
  ] },
  { caption: 'PRODUCTION', items: [
    { to: '/app/production', label: 'Machine board', perms: ['production.view'] },
    { to: '/app/work-orders', label: 'Work orders', perms: ['production.view'] },
    { to: '/app/assignments', label: 'Assignments', perms: ['assignment.view', 'assignment.create'] },
    { to: '/app/maintenance', label: 'Maintenance', perms: ['breakdown.report', 'maintenance.fix', 'breakdown.close'] },
    { to: '/app/machines', label: 'Machines', perms: ['machines.view'] },
  ] },
  { caption: 'QUALITY & DISPATCH', items: [
    { to: '/app/quality', label: 'Quality control', perms: ['qc.view'] },
    { to: '/app/dispatch', label: 'Dispatch', perms: ['dispatch.view'] },
  ] },
  { caption: 'PEOPLE', items: [
    { to: '/app/attendance', label: 'Attendance', perms: ['attendance.view'] },
    { to: '/app/workers', label: 'Workers', perms: ['workers.view'] },
    { to: '/app/wages', label: 'Wages', perms: ['wages.view'] },
  ] },
  { caption: 'MONEY', items: [
    { to: '/app/finance', label: 'Accounts', perms: ['invoice.view', 'payment.view', 'expense.view'] },
    { to: '/app/reports', label: 'Reports', perms: ['reports.cost', 'reports.pnl', 'reports.production', 'reports.qc', 'reports.attendance', 'wages.view'] },
  ] },
  { caption: 'ADMIN', items: [
    { to: '/app/staff', label: 'Staff', perms: ['staff.view'] },
    { to: '/app/roles', label: 'Roles & permissions', perms: ['roles.view'] },
    { to: '/app/settings', label: 'Mill settings', perms: ['settings.update', 'settings.create'] },
  ] },
];

export default function AppLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const close = () => setOpen(false);
  const allowed = (item) => !item.perms || item.perms.some((p) => session.can(p));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);

  const nav = (
    <>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoWeaveIcon size={28} />
        <span style={{ color: '#ffffff', letterSpacing: '-0.5px' }}>sameta</span>
      </div>
      {groups.map((g, i) => (
        <div key={g.caption || i}>
          {g.caption && <div className="nav-caption">{g.caption}</div>}
          <nav aria-label={g.caption || 'Main navigation'}>
            {g.items.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={close}>{item.label}</NavLink>)}
          </nav>
        </div>
      ))}
      <div className="sidebar-footer">
        CONNECTED MILL OPERATIONS
        <br />
        <strong>From yarn to delivery.</strong>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{nav}</aside>

      <Drawer placement="left" open={open} onClose={close} title="Sameta navigation">
        {nav}
      </Drawer>

      <div className="workspace">
        <header className="topbar">
          <Button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">Menu</Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, fontWeight: 600, color: '#192A51' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
            </svg>
            {session.context.mill.name}
          </div>

          <div className="topbar-right">
            <NotificationBell />
            <Link to="/app/profile" className="role-label" title="My profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {session.context.user?.full_name || session.context.user?.email} · {session.context.role.name}
            </Link>
            <Button style={{ borderRadius: 8, height: 36, borderColor: '#e5e7eb' }} onClick={async () => { try { await session.signOut(); } catch (err) { setError(err.message); } }}>Sign out</Button>
          </div>
        </header>

        <main className="main-content">
          {error && <Alert type="error" message={error} closable onClose={() => setError(null)} />}
          <Outlet />
        </main>

        <footer className="workspace-footer">SAMETA <span>Mill operations, in sync.</span></footer>
      </div>
    </div>
  );
}
