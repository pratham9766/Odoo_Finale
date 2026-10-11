// Shop-floor layout: big tabs for a tablet, showing only what the person's role can do.
import { Button } from 'antd';
import { Link, NavLink, Outlet } from 'react-router-dom';
import NotificationBell from '@/components/NotificationBell';
import { useSession } from '@/context/Session';
import { LogoWeaveIcon } from './AppLayout';

// the shop-floor tabs: big targets for a tablet, only what the person's role can do
const TABS = [
  { to: '/floor/machine', label: 'My machine', perms: ['production.log'] },
  { to: '/floor/supervisor', label: 'Supervisor', perms: ['assignment.create', 'attendance.mark'] },
  { to: '/floor/qc', label: 'Quality', perms: ['qc.inspect'] },
  { to: '/floor/dispatch', label: 'Dispatch', perms: ['dispatch.create'] },
];

export default function FloorLayout() {
  const session = useSession();
  const tabs = TABS.filter((t) => t.perms.some((p) => session.can(p)));
  return (
    <div className="floor-shell">
      <header className="floor-top">
        <div className="floor-brand"><LogoWeaveIcon size={26} /><strong>{session.context.mill.name}</strong></div>
        <nav className="floor-tabs">{tabs.map((t) => <NavLink key={t.to} to={t.to}>{t.label}</NavLink>)}</nav>
        <div className="floor-right">
          <NotificationBell />
          <Link to="/app/profile" className="floor-user">{session.context.user?.full_name || session.context.role.name}</Link>
          <Button onClick={() => session.signOut().catch(() => {})}>Sign out</Button>
        </div>
      </header>
      <main className="floor-main"><Outlet /></main>
    </div>
  );
}
