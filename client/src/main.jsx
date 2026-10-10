import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Result, Skeleton } from 'antd';
import { SessionProvider } from '@/context/Session';
import AppRoutes from '@/routes';
import '@/styles/index.css';
import '@/styles/screens.css';
const AcceptInvite = lazy(() => import('@/features/AcceptInvite'));
const Track = lazy(() => import('@/features/Track'));
const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: (count,error) => error.status >= 500 && count < 1 }, mutations: { retry: false } } });
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider theme={theme}>
        <QueryClientProvider client={cache}>
          <BrowserRouter>
            <Suspense fallback={<div className="main-content"><Skeleton active /></div>}>
              <Routes>
                <Route path="/invite/staff/:token" element={<AcceptInvite />} />
                <Route path="/track/:token" element={<Track />} />
                <Route path="*" element={<SessionProvider><AppRoutes /></SessionProvider>} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </QueryClientProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
