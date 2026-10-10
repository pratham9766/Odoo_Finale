import { useState, useMemo } from 'react';
import { Layout, Menu, Drawer, Avatar, Dropdown, Button, Typography } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  MenuFoldOutlined, MenuUnfoldOutlined,
  UserOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';
import { useMill } from '@/hooks/useMill';
import { usePermission } from '@/hooks/usePermission';
import { millNav } from '@/config/nav';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

function filterNav(items, can) {
  return items
    .map((item) => {
      if (item.children) {
        const children = filterNav(item.children, can);
        if (children.length === 0) return null;
        return { ...item, children };
      }
      if (item.anyOf && !can(...item.anyOf)) return null;
      return item;
    })
    .filter(Boolean);
}

function navToAntd(items, location, navigate) {
  return items.map((item) => {
    if (item.children) {
      return {
        key: item.key,
        icon: item.icon ? <item.icon /> : null,
        label: item.label,
        children: navToAntd(item.children, location, navigate),
      };
    }
    return {
      key: item.key,
      icon: item.icon ? <item.icon /> : null,
      label: <span onClick={() => navigate(item.to)}>{item.label}</span>,
    };
  });
}

function getSelectedKeys(items, pathname) {
  for (const item of items) {
    if (item.to && pathname.startsWith(item.to)) return [item.key];
    if (item.children) {
      const sub = getSelectedKeys(item.children, pathname);
      if (sub.length) return sub;
    }
  }
  return [];
}

function getOpenKeys(items, pathname) {
  for (const item of items) {
    if (item.children) {
      const sub = getSelectedKeys(item.children, pathname);
      if (sub.length) return [item.key];
    }
  }
  return [];
}

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { mill, role } = useMill();
  const { can } = usePermission();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(992);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleNav = useMemo(() => filterNav(millNav, can), [can]);
  const menuItems = useMemo(() => navToAntd(visibleNav, location, navigate), [visibleNav, location, navigate]);
  const selectedKeys = useMemo(() => getSelectedKeys(visibleNav, location.pathname), [visibleNav, location.pathname]);
  const defaultOpenKeys = useMemo(() => getOpenKeys(visibleNav, location.pathname), [visibleNav, location.pathname]);

  const userMenu = [
    { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', danger: true },
  ];

  const handleUserMenu = ({ key }) => {
    if (key === 'signout') signOut();
  };

  const millName = mill?.name || 'Everest Textile Mills';
  const roleName = role?.name || 'Staff';
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const sidebarMenu = (
    <div className="flex flex-col h-full">
      {/* Logo & Mill Name */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '20px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-white font-bold text-lg leading-tight truncate tracking-tight">SAMETA</div>
            <div className="text-white/50 text-xs truncate">{millName}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          style={{ background: 'transparent', borderRight: 0 }}
        />
      </div>

      {/* User profile footer */}
      <div className="p-3 border-t border-white/10">
        <Dropdown menu={{ items: userMenu, onClick: handleUserMenu }} trigger={['click']} placement="topRight">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
            <Avatar size={34} style={{ background: '#006B73', flexShrink: 0 }}>
              {displayName[0]?.toUpperCase()}
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-white text-xs font-semibold truncate leading-tight">{displayName}</div>
                <div className="text-white/50 text-[11px] truncate capitalize">{roleName}</div>
              </div>
            )}
          </div>
        </Dropdown>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile ? (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={240}
          collapsedWidth={72}
          style={{
            background: '#12233F',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
            zIndex: 100,
          }}
        >
          {sidebarMenu}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0, background: '#12233F' } }}
          width={260}
        >
          {sidebarMenu}
        </Drawer>
      )}

      <Layout style={{ background: '#F8FAFC' }}>
        <Header
          style={{
            background: '#FFFFFF',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #E2E8F0',
            height: 56,
            position: 'sticky',
            top: 0,
            zIndex: 90,
          }}
        >
          <div className="flex items-center gap-3">
            <Button
              type="text"
              icon={isMobile ? <MenuUnfoldOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => (isMobile ? setDrawerOpen(true) : setCollapsed(!collapsed))}
              style={{ fontSize: 16 }}
            />
            <Text strong style={{ fontSize: 15, color: '#1E293B' }}>{millName}</Text>
          </div>

          <div className="flex items-center gap-3">
            <span style={{ fontSize: 13, color: '#64748B' }}>Role: <strong style={{ color: '#0F172A' }}>{roleName}</strong></span>
            <Dropdown menu={{ items: userMenu, onClick: handleUserMenu }} trigger={['click']}>
              <Avatar size={32} style={{ background: '#006B73', cursor: 'pointer' }}>
                {displayName[0]?.toUpperCase()}
              </Avatar>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: isMobile ? 12 : 24, minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
