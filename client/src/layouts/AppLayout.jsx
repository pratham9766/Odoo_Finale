import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Alert, Button, Drawer } from 'antd';
import Icon from '@/components/Icons';
import NotificationBell from '@/components/NotificationBell';
import { useSession } from '@/context/Session';
import { TitleSlot } from '@/components/States';

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
  { items: [
    { to: '/app', label: 'Dashboard', icon: 'home', end: true },
    { to: '/app/my-work', label: 'My work', icon: 'person' },
  ] },
  { caption: 'SALES', items: [
    { to: '/app/orders', label: 'Orders', icon: 'orders', perms: ['orders.view'] },
    { to: '/app/contacts', label: 'Buyers & suppliers', icon: 'people', perms: ['contacts.view'] },
  ] },
  { caption: 'STORES', items: [
    { to: '/app/stock', label: 'Inventory', icon: 'box', perms: ['stock.view'] },
    { to: '/app/receipts', label: 'Goods receipts', icon: 'receipt', perms: ['receipt.view', 'receipt.create'] },
    { to: '/app/purchases', label: 'Purchase orders', icon: 'clipboard', perms: ['po.view'] },
    { to: '/app/items', label: 'Items', icon: 'box', perms: ['items.view'] },
    { to: '/app/boms', label: 'Recipes (BOM)', icon: 'layers', perms: ['bom.view'] },
  ] },
  { caption: 'PRODUCTION', items: [
    { to: '/app/production', label: 'Machine board', icon: 'loom', perms: ['production.view'] },
    { to: '/app/work-orders', label: 'Work orders', icon: 'clipboard', perms: ['production.view'] },
    { to: '/app/assignments', label: 'Assignments', icon: 'people', perms: ['assignment.view', 'assignment.create'] },
    { to: '/app/maintenance', label: 'Maintenance', icon: 'wrench', perms: ['breakdown.report', 'maintenance.fix', 'breakdown.close'] },
    { to: '/app/machines', label: 'Machines', icon: 'gear', perms: ['machines.view'] },
  ] },
  { caption: 'QUALITY & DISPATCH', items: [
    { to: '/app/quality', label: 'Quality control', icon: 'check', perms: ['qc.view'] },
    { to: '/app/dispatch', label: 'Dispatch', icon: 'truck', perms: ['dispatch.view'] },
  ] },
  { caption: 'PEOPLE', items: [
    { to: '/app/attendance', label: 'Attendance', icon: 'calendar', perms: ['attendance.view'] },
    { to: '/app/workers', label: 'Workers', icon: 'person', perms: ['workers.view'] },
    { to: '/app/wages', label: 'Wages', icon: 'wallet', perms: ['wages.view'] },
  ] },
  { caption: 'MONEY', items: [
    { to: '/app/finance', label: 'Accounts', icon: 'bank', perms: ['invoice.view', 'payment.view', 'expense.view'] },
    { to: '/app/reports', label: 'Reports', icon: 'chart', perms: ['reports.cost', 'reports.pnl', 'reports.production', 'reports.qc', 'reports.attendance', 'wages.view'] },
  ] },
  { caption: 'ADMIN', items: [
    { to: '/app/staff', label: 'Staff', icon: 'people', perms: ['staff.view'] },
    { to: '/app/roles', label: 'Roles & permissions', icon: 'shield', perms: ['roles.view'] },
    { to: '/app/settings', label: 'Mill settings', icon: 'sliders', perms: ['settings.update', 'settings.create'] },
  ] },
];

export default function AppLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [titleNode, setTitleNode] = useState(null);   // the top-bar element pages put their title into
  const titleSlot = useMemo(() => ({ node: titleNode }), [titleNode]);
  const close = () => setOpen(false);
  const allowed = (item) => !item.perms || item.perms.some((p) => session.can(p));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);

  const user = session.context.user;
  const name = user?.full_name || user?.email || session.context.role.name;
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const signOut = async () => { try { await session.signOut(); } catch (err) { setError(err.message); } };

  const nav = (
    <>
      <div className="brand">
        <LogoWeaveIcon size={34} />
        <span>sameta</span>
      </div>
      <div className="sidebar-mill"><Icon name="factory" size={15} />{session.context.mill.name}</div>
      {groups.map((g, i) => (
        <div key={g.caption || i} className="nav-group">
          {g.caption && <div className="nav-caption">{g.caption}</div>}
          <nav aria-label={g.caption || 'Main navigation'}>
            {g.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={close}>
                <Icon name={item.icon} size={19} />{item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
      <div className="sidebar-footer"><i aria-hidden="true" />Mill operations, in sync.</div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{nav}</aside>

      <Drawer placement="left" open={open} onClose={close} title="Sameta navigation" rootClassName="nav-drawer">
        {nav}
      </Drawer>

      <div className="workspace">
        <header className="topbar">
          <Button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation" icon={<Icon name="menu" size={18} />} />

          <div className="topbar-title-slot" ref={setTitleNode} />

          <div className="topbar-right">
            <NotificationBell />
            <Link to="/app/profile" className="user-chip" title="My profile">
              <span className="avatar">{initials}</span>
              <span className="user-chip-text">{name} · {session.context.role.name}</span>
            </Link>
            <Button className="signout-btn" icon={<Icon name="logout" size={17} />} onClick={signOut}>Sign out</Button>
          </div>
        </header>

        <main className="main-content">
          {error && <Alert type="error" message={error} closable onClose={() => setError(null)} />}
          <TitleSlot.Provider value={titleSlot}><Outlet /></TitleSlot.Provider>
        </main>
      </div>
    </div>
  );
}
