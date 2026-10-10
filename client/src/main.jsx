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
const ResetPassword = lazy(() => import('@/features/ResetPassword'));
const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: (count,error) => error.status >= 500 && count < 1 }, mutations: { retry: false } } });
class ErrorBoundary extends React.Component { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <Result status="error" title="Something went wrong" subTitle="Reload the page to recover. Unsaved changes may need to be entered again." /> : this.props.children; } }
const theme = {
  token: {
    colorPrimary: '#103C32',
    colorInfo: '#A57A2C',
    colorTextBase: '#103C32',
    colorTextSecondary: '#5F6B63',
    colorBgBase: '#ffffff',
    colorBorder: '#E7DFCC',
    colorBorderSecondary: 'rgba(231, 223, 204, 0.45)',
    borderRadius: 8,
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Button: {
      colorPrimary: '#103C32',
      colorPrimaryHover: '#2B5242',
      colorPrimaryActive: '#142B21',
      defaultBorderColor: '#E7DFCC',
      defaultColor: '#103C32',
      defaultHoverBorderColor: '#A57A2C',
      defaultHoverColor: '#A57A2C',
      defaultHoverBg: '#F5F0E4',
    },
    Table: {
      headerBg: '#F5F0E4',
      headerColor: '#103C32',
      rowHoverBg: 'rgba(245, 240, 228, 0.4)',
      borderColor: '#E7DFCC',
      headerSplitColor: 'transparent',
    },
    Card: {
      headerBg: '#F5F0E4',
    },
    Select: {
      activeBorderColor: '#A57A2C',
      hoverBorderColor: '#C9A766',
    },
    Input: {
      activeBorderColor: '#A57A2C',
      hoverBorderColor: '#C9A766',
    },
    Tag: {
      defaultBg: '#F5F0E4',
      defaultColor: '#103C32',
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
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<SessionProvider><AppRoutes /></SessionProvider>} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </QueryClientProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
