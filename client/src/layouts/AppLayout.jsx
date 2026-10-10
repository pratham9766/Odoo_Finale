import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Alert, Button, Drawer, Input, Select } from 'antd';
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

export default function AppLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  const isManufacturer = session.context.org.types?.includes('manufacturer');

  const nav = (
    <>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoWeaveIcon size={28} />
        <span style={{ color: '#ffffff', letterSpacing: '-0.5px' }}>sameta</span>
      </div>

      <div className="nav-caption">WORKSPACE</div>

      <nav aria-label="Main navigation">
        <NavLink to="/app" end onClick={() => setOpen(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Workspace
        </NavLink>

        {isManufacturer && session.can('orders.view') && (
          <NavLink to="/app/orders" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Orders
          </NavLink>
        )}

        {isManufacturer && session.can('stock.view') && (
          <NavLink to="/app/stock" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Inventory
          </NavLink>
        )}

        {isManufacturer && session.can('production.view') && (
          <NavLink to="/app/production" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            Production floor
          </NavLink>
        )}

        <NavLink to="/app/orders" onClick={() => setOpen(false)} style={{ opacity: 0.75 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Buyers
        </NavLink>

        <NavLink to="/app/orders" onClick={() => setOpen(false)} style={{ opacity: 0.75 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Analytics
        </NavLink>

        <NavLink to="/app" onClick={() => setOpen(false)} style={{ opacity: 0.75 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </NavLink>
      </nav>

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

      <Drawer placement="left" open={open} onClose={() => setOpen(false)} title="Sameta navigation">
        {nav}
      </Drawer>

      <div className="workspace">
        <header className="topbar">
          <Button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
            Menu
          </Button>

          {/* Org Selector with Building Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, maxWidth: 680 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Select
                className="org-select"
                aria-label="Current organization"
                value={session.orgId}
                onChange={session.switchOrg}
                options={session.orgs.map(o => ({
                  value: o.id,
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 550 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                        <path d="M9 22v-4h6v4" />
                        <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
                      </svg>
                      {o.name}
                    </span>
                  ),
                }))}
              />
            </div>

            {/* Global Search Bar */}
            <Input
              style={{
                maxWidth: 380,
                borderRadius: 8,
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                height: 38,
              }}
              prefix={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              }
              placeholder="Search orders, buyers, fabrics..."
            />
          </div>

          <div className="topbar-right">
            {/* Notification Bell with unread dot */}
            <button
              type="button"
              aria-label="Notifications"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 6,
                color: '#4b5563',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#d0af71',
                }}
              />
            </button>

            {/* User role label / pill */}
            <span className="role-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {session.context.role?.name || 'Owner'}
              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.6 }}>
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </span>

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
