import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Alert, Button, Drawer } from 'antd';
import { useSession } from '@/context/Session';

function LogoWeaveIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 14L22 29M14 7L29 22" stroke="#d0af71" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 29L29 14M7 22L22 7" stroke="#c4a161" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 11L25 25M11 25L25 11" stroke="#d9bd85" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function Icon({ children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
      {children}
    </svg>
  );
}

const ICONS = {
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  orders: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  stock: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  production: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  staff: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  roles: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
};

export default function AppLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const close = () => setOpen(false);

  // every entry shows only when the role has the permission; Workspace is open to everyone
  const link = (to, label, icon, permission, extra = {}) =>
    (!permission || session.can(permission)) && (
      <NavLink to={to} onClick={close} {...extra}>
        <Icon>{ICONS[icon]}</Icon>
        {label}
      </NavLink>
    );
  const showAdmin = session.can('staff.view') || session.can('roles.view');

  const nav = (
    <>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoWeaveIcon size={28} />
        <span style={{ color: '#ffffff', letterSpacing: '-0.5px' }}>sameta</span>
      </div>

      <div className="nav-caption">WORKSPACE</div>

      <nav aria-label="Main navigation">
        {link('/app', 'Workspace', 'home', null, { end: true })}
        {link('/app/orders', 'Orders', 'orders', 'orders.view')}
        {link('/app/stock', 'Inventory', 'stock', 'stock.view')}
        {link('/app/production', 'Production floor', 'production', 'production.view')}
      </nav>

      {showAdmin && (
        <>
          <div className="nav-caption">ADMIN</div>
          <nav aria-label="Administration">
            {link('/app/staff', 'Staff', 'staff', 'staff.view')}
            {link('/app/roles', 'Roles & permissions', 'roles', 'roles.view')}
          </nav>
        </>
      )}

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
          <Button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
            Menu
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, fontWeight: 600, color: '#192A51' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
            </svg>
            {session.context.mill.name}
          </div>

          <div className="topbar-right">
            <Link to="/app/profile" className="role-label" title="My profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {session.context.user?.full_name || session.context.user?.email} · {session.context.role.name}
            </Link>

            <Button
              style={{ borderRadius: 8, height: 36, borderColor: '#e5e7eb' }}
              onClick={async () => {
                try {
                  await session.signOut();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Sign out
            </Button>
          </div>
        </header>

        <main className="main-content">
          {error && <Alert type="error" message={error} closable onClose={() => setError(null)} />}
          <Outlet />
        </main>

        <footer className="workspace-footer">
          SAMETA <span>Mill operations, in sync.</span>
        </footer>
      </div>
    </div>
  );
}
