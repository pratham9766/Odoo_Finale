import { useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Avatar, Typography } from 'antd';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { floorNav } from '@/config/nav';
import { ExperimentOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function FloorLayout() {
  const { user } = useAuth();
  const { org, role } = useOrg();
  const { can } = usePermission();
  const location = useLocation();

  const visibleNav = useMemo(
    () => floorNav.filter(item => !item.anyOf || can(...item.anyOf)),
    [can]
  );

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Operator';

  return (
    <div className="tl-floor-layout">
      {/* Floor header */}
      <div className="tl-floor-header">
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">{org?.name ?? 'SAMETA'}</div>
          <div className="text-white/60 text-xs">{role?.name} · Shift A</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-sm font-medium">{displayName.split(' ')[0]}</span>
          <Avatar size={32} style={{ background: '#006B73', flexShrink: 0 }}>
            {displayName[0]?.toUpperCase()}
          </Avatar>
        </div>
      </div>

      {/* Page content */}
      <div className="tl-floor-content">
        <Outlet />
      </div>

      {/* Bottom nav */}
      {visibleNav.length > 0 && (
        <nav className="tl-floor-nav" role="navigation" aria-label="Floor navigation">
          {visibleNav.map(item => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                `tl-floor-nav-item${isActive ? ' active' : ''}`
              }
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
