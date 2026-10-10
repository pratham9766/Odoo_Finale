import { Button, message } from 'antd';
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
  { to: '/floor/my-work', label: 'My work', perms: null },   // everyone: own attendance, output, pay
];

export default function FloorLayout() {
  const session = useSession();
  const tabs = TABS.filter((t) => !t.perms || t.perms.some((p) => session.can(p)));
  return (
    <div className="floor-shell">
      <header className="floor-top">
        <div className="floor-brand"><LogoWeaveIcon size={26} /><strong>{session.context.mill.name}</strong></div>
        <nav className="floor-tabs">{tabs.map((t) => <NavLink key={t.to} to={t.to}>{t.label}</NavLink>)}</nav>
        <div className="floor-right">
          <NotificationBell />
          <Link to="/app/profile" className="floor-user">{session.context.user?.full_name || session.context.role.name}</Link>
          <Button onClick={() => session.signOut().catch((err) => message.error(err.message))}>Sign out</Button>
        </div>
      </header>
      <main className="floor-main"><Outlet /></main>
    </div>
  );
}
