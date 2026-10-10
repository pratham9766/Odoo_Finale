import { useMemo } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Avatar, Dropdown } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';
import { useMill } from '@/hooks/useMill';
import { usePermission } from '@/hooks/usePermission';
import { floorNav } from '@/config/nav';

export default function FloorLayout() {
  const { user, signOut } = useAuth();
  const { mill, role } = useMill();
  const { can } = usePermission();

  const visibleNav = useMemo(
    () => floorNav.filter((item) => !item.anyOf || can(...item.anyOf)),
    [can]
  );

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Operator';
  const roleName = role?.name || 'Floor Staff';

  const userMenu = [
    { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', danger: true },
  ];

  return (
    <div className="tl-floor-layout">
      {/* Floor header */}
      <div className="tl-floor-header">
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">{mill?.name || 'Everest Textile Mills'}</div>
          <div className="text-white/60 text-xs">{roleName}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-sm font-medium">{displayName.split(' ')[0]}</span>
          <Dropdown menu={{ items: userMenu, onClick: ({ key }) => key === 'signout' && signOut() }} trigger={['click']}>
            <Avatar size={32} style={{ background: '#006B73', flexShrink: 0, cursor: 'pointer' }}>
              {displayName[0]?.toUpperCase()}
            </Avatar>
          </Dropdown>
        </div>
      </div>

      {/* Page content */}
      <div className="tl-floor-content">
        <Outlet />
      </div>

      {/* Bottom nav */}
      {visibleNav.length > 0 && (
        <nav className="tl-floor-nav" role="navigation" aria-label="Floor navigation">
          {visibleNav.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => `tl-floor-nav-item${isActive ? ' active' : ''}`}
            >
              <item.icon style={{ fontSize: 22 }} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
