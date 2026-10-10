import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Alert, Button, Drawer, Select } from 'antd';
import { useSession } from '@/context/Session';
const links = [['/app/orders','Orders','orders.view','01'],['/app/stock','Inventory','stock.view','02'],['/app/production','Production floor','production.view','03']];
export default function AppLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const nav = <><div className="brand">texlink<span> / </span></div><div className="nav-caption">WORKSPACE</div><nav aria-label="Main navigation">{links.filter(([, , permission]) => session.can(permission)).map(([path,label,,number]) => <NavLink key={path} to={path} onClick={() => setOpen(false)}><span>{number}</span>{label}</NavLink>)}</nav><div className="sidebar-footer">CONNECTED MILL OPERATIONS<br /><strong>From yarn to delivery.</strong></div></>;
  return <div className="app-shell"><aside className="sidebar">{nav}</aside><Drawer placement="left" open={open} onClose={() => setOpen(false)} title="TexLink navigation">{nav}</Drawer><div className="workspace"><header className="topbar"><Button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">Menu</Button><Select className="org-select" aria-label="Current organization" value={session.orgId} onChange={session.switchOrg} options={session.orgs.map(o => ({ value: o.id, label: o.name }))} /><div className="topbar-right"><span className="role-label">{session.context.role?.name}</span><Button onClick={async () => { try { await session.signOut(); } catch (err) { setError(err.message); } }}>Sign out</Button></div></header><main className="main-content">{error && <Alert type="error" message={error} closable onClose={() => setError(null)} />}<Outlet /></main><footer className="workspace-footer">TEXLINK <span>Mill operations, in sync.</span></footer></div></div>;
}
