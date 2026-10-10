import { useState, useMemo } from 'react';
import { Layout, Menu, Drawer, Badge, Avatar, Dropdown, Button, Tag, Typography, Tooltip } from 'antd';
import { Outlet, useNavigate, useLocation, Link, NavLink } from 'react-router-dom';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined,
  UserOutlined, LogoutOutlined, SwapOutlined,
  SearchOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { millNav } from '@/config/nav';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

function filterNav(items, can) {
  return items
    .map(item => {
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
  return items.map(item => {
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
  const { org, orgs, role, switchOrg } = useOrg();
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
    { key: 'profile', icon: <UserOutlined />, label: 'My profile' },
    orgs.length > 1 && { key: 'switch', icon: <SwapOutlined />, label: 'Switch organization' },
    { type: 'divider' },
    { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', danger: true },
  ].filter(Boolean);

  const handleUserMenu = ({ key }) => {
    if (key === 'signout') signOut();
    if (key === 'profile') navigate('/app/settings/profile');
  };

  const sidebarMenu = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '20px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-white font-bold text-lg leading-tight truncate tracking-tight">SAMETA</div>
            <div className="text-white/50 text-xs truncate">{org?.name}</div>
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
          inlineCollapsed={collapsed}
          items={menuItems}
          style={{ background: 'transparent', border: 'none' }}
        />
      </div>

      {/* Role badge */}
      {!collapsed && role && (
        <div className="px-4 py-3 border-t border-white/10">
          <Tag color="cyan" className="text-xs">{role.name}</Tag>
        </div>
      )}
    </div>
  );

  return (
    <Layout className="min-h-screen">

      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider
          width={232}
          collapsedWidth={72}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 200, overflow: 'hidden' }}
        >
          {sidebarMenu}
        </Sider>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={232}
          styles={{ body: { padding: 0, background: '#12233F' }, header: { display: 'none' } }}
        >
          {sidebarMenu}
        </Drawer>
      )}

      {/* Main area */}
      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 72 : 232), transition: 'margin-left 0.2s' }}>
        {/* Topbar */}
        <Header className="tl-topbar" style={{ top: 0, position: 'sticky', zIndex: 100 }}>
          <Button
            type="text"
            icon={isMobile
              ? <MenuUnfoldOutlined />
              : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)
            }
            onClick={() => isMobile ? setDrawerOpen(true) : setCollapsed(c => !c)}
            style={{ color: '#536278' }}
          />

          {/* Org switcher */}
          {orgs.length > 1 ? (
            <Dropdown
              menu={{
                items: orgs.map(o => ({ key: o.id, label: o.name })),
                onClick: ({ key }) => switchOrg(key),
              }}
            >
              <Button type="text" className="font-medium text-strong hidden sm:flex items-center gap-1 max-w-[200px]">
                <span className="truncate">{org?.name}</span>
              </Button>
            </Dropdown>
          ) : (
            <span className="font-medium text-strong text-sm truncate hidden sm:block max-w-[200px]">
              {org?.name}
            </span>
          )}

          <div className="flex-1" />

          {/* Search */}
          <Tooltip title="Search orders, rolls, workers…">
            <Button type="text" icon={<SearchOutlined />} style={{ color: '#536278' }} />
          </Tooltip>

          {/* Notifications */}
          <Badge count={0} size="small">
            <Button type="text" icon={<BellOutlined />} style={{ color: '#536278' }} />
          </Badge>

          {/* User menu */}
          <Dropdown menu={{ items: userMenu, onClick: handleUserMenu }}>
            <button className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-1 rounded-lg hover:bg-appbg">
              <Avatar size={32} icon={<UserOutlined />} style={{ background: '#006B73' }} />
              <span className="hidden md:block text-sm text-strong font-medium">
                {user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0]}
              </span>
            </button>
          </Dropdown>
        </Header>

        {/* Content */}
        <Content className="tl-main-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
