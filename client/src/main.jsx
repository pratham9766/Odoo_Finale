import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Result, Skeleton } from 'antd';
import { SessionProvider, useSession } from '@/context/Session';
import AppLayout from '@/layouts/AppLayout';
import WorkspaceOverview from '@/features/WorkspaceOverview';
import '@/styles/index.css';
const Orders = lazy(() => import('@/features/Orders'));
const CreateOrder = lazy(() => import('@/features/CreateOrder'));
const OrderDetail = lazy(() => import('@/features/OrderDetail'));
const Operations = lazy(() => import('@/features/Operations'));
const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: (count,error) => error.status >= 500 && count < 1 }, mutations: { retry: false } } });
function Gate({ permission, children }) { const session = useSession(); return session.context.org.types?.includes('manufacturer') && session.can(permission) ? children : <Result status="403" title="Access restricted" subTitle="This mill workspace requires the appropriate organization and permissions. Ask your administrator for access." />; }
function Home() { const session = useSession(); const target = session.context.org.types?.includes('manufacturer') && [['orders.view','orders'],['stock.view','stock'],['production.view','production']].find(([permission]) => session.can(permission)); return target ? <Navigate to={`/app/${target[1]}`} replace /> : <WorkspaceOverview />; }
class ErrorBoundary extends React.Component { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <Result status="error" title="Something went wrong" subTitle="Reload the page to recover. Unsaved changes may need to be entered again." /> : this.props.children; } }
const theme = {
  token: {
    colorPrimary: '#192A51',
    colorInfo: '#967AA1',
    colorTextBase: '#192A51',
    colorTextSecondary: '#58637e',
    colorBgBase: '#ffffff',
    colorBorder: '#D5C6E0',
    colorBorderSecondary: 'rgba(213, 198, 224, 0.45)',
    borderRadius: 8,
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Button: {
      colorPrimary: '#192A51',
      colorPrimaryHover: '#283e74',
      colorPrimaryActive: '#121f3d',
      defaultBorderColor: '#D5C6E0',
      defaultColor: '#192A51',
      defaultHoverBorderColor: '#967AA1',
      defaultHoverColor: '#967AA1',
      defaultHoverBg: '#F5E6E8',
    },
    Table: {
      headerBg: '#F5E6E8',
      headerColor: '#192A51',
      rowHoverBg: 'rgba(245, 230, 232, 0.4)',
      borderColor: '#D5C6E0',
      headerSplitColor: 'transparent',
    },
    Card: {
      headerBg: '#F5E6E8',
    },
    Select: {
      activeBorderColor: '#967AA1',
      hoverBorderColor: '#AAA1C8',
    },
    Input: {
      activeBorderColor: '#967AA1',
      hoverBorderColor: '#AAA1C8',
    },
    Tag: {
      defaultBg: '#F5E6E8',
      defaultColor: '#192A51',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><ConfigProvider theme={theme}><QueryClientProvider client={cache}><BrowserRouter><SessionProvider><Suspense fallback={<div className="main-content"><Skeleton active /></div>}><Routes><Route path="/app" element={<AppLayout />}><Route index element={<Home />} /><Route path="orders" element={<Gate permission="orders.view"><Orders /></Gate>} /><Route path="orders/new" element={<Gate permission="orders.create"><CreateOrder /></Gate>} /><Route path="orders/:id" element={<Gate permission="orders.view"><OrderDetail /></Gate>} /><Route path="stock" element={<Gate permission="stock.view"><Operations kind="stock" /></Gate>} /><Route path="production" element={<Gate permission="production.view"><Operations kind="production" /></Gate>} /></Route><Route path="/" element={<Navigate to="/app" replace />} /><Route path="/login" element={<Navigate to="/app" replace />} /><Route path="*" element={<Result status="404" title="Page not found" extra={<a href="/app">Back to workspace</a>} />} /></Routes></Suspense></SessionProvider></BrowserRouter></QueryClientProvider></ConfigProvider></ErrorBoundary></React.StrictMode>);
