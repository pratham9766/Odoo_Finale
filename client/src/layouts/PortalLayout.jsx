import { Layout, Menu, Button, Dropdown, Badge, Avatar } from 'antd';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { BellOutlined, MenuOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';
import { buyerNav } from '@/config/nav';
import { usePermission } from '@/hooks/usePermission';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Drawer } from 'antd';

const { Header, Content } = Layout;

export default function PortalLayout({ nav = buyerNav, title = 'SAMETA' }) {
  const { user, signOut } = useAuth();
  const { org } = useOrg();
  const { can } = usePermission();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleNav = nav.filter(item => !item.anyOf || can(...item.anyOf));

  const navItems = visibleNav.map(item => ({
    key: item.key,
    label: (
      <Link to={item.to} className="flex items-center gap-1">
        {item.icon && <item.icon />}
        <span>{item.label}</span>
      </Link>
    ),
  }));

  const selectedKey = visibleNav.find(item => location.pathname.startsWith(item.to))?.key;

  const userMenu = [
    { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', danger: true },
  ];

  return (
    <Layout className="min-h-screen" style={{ background: '#F4F6F8' }}>
      <Header
        className="flex items-center gap-4 px-4 sm:px-6"
        style={{ background: '#fff', borderBottom: '1px solid #DCE3E9', height: 64, lineHeight: '64px', position: 'sticky', top: 0, zIndex: 100 }}
      >
        <div className="flex items-center gap-2 font-bold text-strong text-lg">
          <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '18px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
            </svg>
            <span className="hidden sm:block">SAMETA</span>
          </div>
        </div>
        <span className="text-secondary text-sm hidden sm:block">·</span>
        <span className="text-secondary text-sm hidden sm:block truncate max-w-[160px]">{org?.name}</span>

        <div className="flex-1" />

        {/* Desktop nav */}
        {!isMobile && (
          <Menu
            mode="horizontal"
            selectedKeys={selectedKey ? [selectedKey] : []}
            items={navItems}
            style={{ border: 'none', background: 'transparent', flex: 'none' }}
          />
        )}

        <Badge count={0} size="small">
          <Button type="text" icon={<BellOutlined />} style={{ color: '#536278' }} />
        </Badge>

        <Dropdown menu={{ items: userMenu, onClick: ({ key }) => key === 'signout' && signOut() }}>
          <Avatar size={32} icon={<UserOutlined />} style={{ background: '#006B73', cursor: 'pointer' }} />
        </Dropdown>

        {/* Mobile menu */}
        {isMobile && (
          <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
        )}
      </Header>

      {isMobile && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" width={280} title={org?.name}>
          <Menu
            mode="vertical"
            selectedKeys={selectedKey ? [selectedKey] : []}
            items={navItems}
            onClick={() => setDrawerOpen(false)}
            style={{ border: 'none' }}
          />
        </Drawer>
      )}

      <Content className="tl-main-content">
        <Outlet />
      </Content>
    </Layout>
  );
}
