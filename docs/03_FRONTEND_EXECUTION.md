# Sameta — Frontend Execution Plan

> React 18 + Vite (JavaScript, no TypeScript) · React Router v6 · TanStack Query v5 · Ant Design 5 + Tailwind CSS 3 · Recharts · Supabase Auth · Socket.io client.
> Read [01_OVERALL_PLAN.md](01_OVERALL_PLAN.md) for product, roles and workflows, and [02_BACKEND_EXECUTION.md](02_BACKEND_EXECUTION.md) for the API.

---

## Table of contents

1. [Goals and conventions](#1-goals-and-conventions)
2. [Project setup](#2-project-setup)
3. [Folder structure](#3-folder-structure)
4. [Core libraries (`lib/`)](#4-core-libraries-lib)
5. [Contexts and hooks](#5-contexts-and-hooks)
6. [Routing and guards](#6-routing-and-guards)
7. [Layouts and navigation](#7-layouts-and-navigation)
8. [Design system](#8-design-system)
9. [Data fetching patterns](#9-data-fetching-patterns)
10. [Shared components](#10-shared-components)
11. [Screen specs — Mill office](#11-screen-specs--mill-office)
12. [Screen specs — Floor, kiosk](#12-screen-specs--floor-kiosk)
13. [Screen specs — Buyer, supplier, transport, driver](#13-screen-specs--buyer-supplier-transport-driver)
14. [Screen specs — Auth, onboarding, admin, public](#14-screen-specs--auth-onboarding-admin-public)
15. [QR scanning and printing](#15-qr-scanning-and-printing)
16. [Realtime UX](#16-realtime-ux)
17. [AI chat UI](#17-ai-chat-ui)
18. [States, feedback, accessibility](#18-states-feedback-accessibility)
19. [Performance](#19-performance)
20. [Testing and QA](#20-testing-and-qa)
21. [Deployment](#21-deployment)
22. [Phase checklist](#22-phase-checklist)

---

## 1. Goals and conventions

**Goals**
- One React app that serves every portal (mill office, floor, kiosk, buyer, supplier, transport, driver, admin, public).
- Every screen is permission-aware: menus, buttons and price columns are hidden for users without the permission. The backend still enforces everything.
- Floor, kiosk and driver screens work on cheap Android phones: large buttons, scan-first, one action per screen.

**Conventions**

| Topic | Rule |
|---|---|
| Language | JavaScript (`.jsx` for components, `.js` for logic) |
| Components | Function components + hooks; one component per file; `PascalCase.jsx` |
| Hooks | `useXxx.js` in `hooks/` or feature `queries.js` |
| Styling | Ant Design components for structure; Tailwind utility classes for spacing / layout; no inline style objects except dynamic values |
| Server state | TanStack Query only (never copy server data into `useState`) |
| Client state | Context for auth / org / socket; `useState` for local UI; URL search params for filters and tabs |
| Forms | Ant Design `Form` with `rules` |
| API calls | Only through `lib/api.js` |
| Dates | `dayjs`, display in Asia/Kolkata, format `DD MMM YYYY`, `HH:mm` |
| Money | `formatINR()` → `₹ 1,84,200` (Indian grouping) |
| Quantities | Always show the unit: `1,200 m`, `310 kg` |
| Text | Short, plain English; words the factory uses (GRN, roll, shift, dispatch) |
| Imports | Absolute alias `@/` → `src/` |

---

## 2. Project setup

### 2.1 Create and install

```bash
npm create vite@latest client -- --template react
cd client
npm i react-router-dom @tanstack/react-query @tanstack/react-query-devtools axios \
      antd @ant-design/icons dayjs recharts @supabase/supabase-js socket.io-client \
      html5-qrcode qrcode.react react-to-print clsx
npm i -D tailwindcss@3 postcss autoprefixer eslint prettier vitest @testing-library/react \
      @testing-library/user-event jsdom
npx tailwindcss init -p
```

### 2.2 `vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
});
```

### 2.3 `tailwind.config.js`

Tailwind's CSS reset (preflight) conflicts with Ant Design, so turn it off.

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#3B5BDB', dark: '#2F4AB8' },
        ok: '#2F9E44', warn: '#F08C00', bad: '#E03131', info: '#1C7ED6', muted: '#868E96',
      },
    },
  },
};
```

### 2.4 `.env.example`

```bash
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=...            # public anon key, used for auth only
VITE_ENABLE_DEMO_SWITCHER=true        # dev-only quick login panel
```

### 2.5 Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src",
    "test": "vitest"
  }
}
```

---

## 3. Folder structure

```
client/src/
├─ main.jsx                    # providers + router
├─ router.jsx                  # all routes (lazy-loaded portals)
├─ styles/index.css            # tailwind directives + small globals
├─ lib/
│  ├─ supabase.js  api.js  queryClient.js  socket.js
│  ├─ format.js                # formatINR, formatQty, formatDate, timeAgo
│  ├─ status.js                # status → colour/label map (single source)
│  ├─ permissions.js           # helpers + permission constants
│  └─ textile.js               # m↔kg, yarn length, warp/weft helpers (for BOM editor)
├─ context/
│  ├─ AuthContext.jsx  OrgContext.jsx  SocketContext.jsx
├─ hooks/
│  ├─ useAuth.js  useOrg.js  usePermission.js  useSocketEvent.js
│  ├─ useQrScanner.js  useUrlState.js  useDebounce.js  useIsMobile.js
├─ guards/
│  ├─ ProtectedRoute.jsx  OrgRequired.jsx  PortalGuard.jsx  PermissionGuard.jsx  PlatformAdminGuard.jsx
├─ layouts/
│  ├─ PublicLayout.jsx  AuthLayout.jsx  AppLayout.jsx  FloorLayout.jsx  KioskLayout.jsx
│  ├─ PortalLayout.jsx  DriverLayout.jsx  AdminLayout.jsx
├─ config/
│  ├─ nav.mill.js  nav.floor.js  nav.buyer.js  nav.supplier.js  nav.transport.js  nav.admin.js
│  └─ portals.js               # homeFor(org, role) → default route
├─ components/
│  ├─ common/   PageHeader  DataTable  StatusBadge  KpiCard  KpiRow  EmptyState  ErrorState
│  │            ConfirmButton  FilterBar  MoneyText  QtyText  DateText  Can  SectionCard
│  │            OrgSwitcher  NotificationBell  UserMenu  CopyField  FileUpload  BigButton
│  ├─ charts/   BarChartCard  LineChartCard  PieChartCard  StackedBarCard  ChartFromSpec
│  ├─ qr/       QrScanner  QrLabel  QrLabelSheet  PrintButton
│  ├─ order/    StageStepper  OrderTimeline  ProgressCell  RiskChip  AvailabilityPanel  RequirementTree
│  ├─ machine/  MachineCard  MachineStatusDot  MachineBoard
│  ├─ roll/     RollTraceTimeline  DefectCounter
│  ├─ attendance/ AttendanceCell  RegisterGrid  TodaySummary
│  ├─ trip/     TripStepper  TripStatusChip
│  └─ ai/       ChatWidget  ChatPanel  ChatMessage  SuggestionChips  InsightCard  SqlDisclosure
└─ features/                   # one folder per domain: api.js · queries.js · pages/ · components/
   ├─ auth/  onboarding/  dashboard/  partners/  staff/  settings/
   ├─ catalog/  inventory/  procurement/  orders/  production/  maintenance/
   ├─ quality/  rolls/  gate/  dispatch/  transport/  driver/  workforce/
   ├─ finance/  reports/  notifications/  ai/
   ├─ floor/  kiosk/  buyer/  supplier/  admin/  public/
```

**Feature folder pattern** (example `features/orders/`):

```
orders/
├─ api.js         # raw calls: listOrders(params), getOrder(id), createOrder(body), ...
├─ queries.js     # useOrders(params), useOrder(id), useCreateOrder(), useConfirmOrder() ...
├─ pages/
│  ├─ OrdersListPage.jsx  OrderDetailPage.jsx  OrderCreatePage.jsx
└─ components/
   ├─ OrderLinesTable.jsx  OrderFilters.jsx  RequirementsTab.jsx
```

---

## 4. Core libraries (`lib/`)

### 4.1 `lib/supabase.js`

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
```

Supabase is used **only for auth** (sign up, sign in, sign out, password reset, session refresh). All data goes through the Node API.

### 4.2 `lib/api.js`

```js
import axios from 'axios';
import { supabase } from './supabase';

let currentOrgId = null;
export const setApiOrg = (orgId) => { currentOrgId = orgId; };

export const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL}/api/v1` });

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (currentOrgId && !config.headers['x-org-id']) config.headers['x-org-id'] = currentOrgId;
  return config;
});

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

api.interceptors.response.use(
  (res) => res.data,                                   // { data, meta }
  async (err) => {
    const status = err.response?.status ?? 0;
    const e = err.response?.data?.error ?? {};
    if (status === 401) await supabase.auth.signOut();
    return Promise.reject(new ApiError(status, e.code ?? 'NETWORK', e.message ?? 'Network error', e.details));
  },
);

// file download helper (PDF / CSV)
export async function download(path, filename) {
  const blob = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
```

> With `responseType: 'blob'` the interceptor returns the blob itself (axios `res.data`).

### 4.3 `lib/queryClient.js`

```js
import { QueryClient } from '@tanstack/react-query';
import { message } from 'antd';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => err?.status >= 500 && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (err) => message.error(err.message),
    },
  },
});
```

### 4.4 `lib/socket.js`

```js
import { io } from 'socket.io-client';

export function connectSocket({ token, orgId }) {
  return io(import.meta.env.VITE_API_URL, {
    auth: { token, orgId },
    transports: ['websocket'],
    reconnection: true,
  });
}
```

### 4.5 `lib/status.js` (single source of truth for colours)

```js
export const STATUS = {
  // generic
  draft: { color: 'default', label: 'Draft' },
  // orders
  confirmed: { color: 'blue', label: 'Confirmed' },
  waiting_material: { color: 'orange', label: 'Waiting material' },
  material_ready: { color: 'cyan', label: 'Material ready' },
  in_production: { color: 'processing', label: 'In production' },
  in_qc: { color: 'geekblue', label: 'In QC' },
  ready_to_ship: { color: 'green', label: 'Ready to ship' },
  partially_dispatched: { color: 'gold', label: 'Partly dispatched' },
  dispatched: { color: 'purple', label: 'Dispatched' },
  delivered: { color: 'success', label: 'Delivered' },
  cancelled: { color: 'default', label: 'Cancelled' },
  // machines
  running: { color: 'success', label: 'Running' },
  idle: { color: 'warning', label: 'Idle' },
  breakdown: { color: 'error', label: 'Breakdown' },
  maintenance: { color: 'default', label: 'Maintenance' },
  // rolls / QC
  pending_qc: { color: 'warning', label: 'Waiting QC' },
  passed: { color: 'success', label: 'Passed' },
  rework: { color: 'processing', label: 'Rework' },
  rejected: { color: 'error', label: 'Rejected' },
  packed: { color: 'cyan', label: 'Packed' },
  // attendance
  present: { color: 'success', label: 'Present' },
  late: { color: 'warning', label: 'Late' },
  half_day: { color: 'gold', label: 'Half day' },
  absent: { color: 'error', label: 'Absent' },
  leave: { color: 'default', label: 'Leave' },
  // trips / dispatch
  requested: { color: 'default', label: 'Requested' },
  assigned: { color: 'blue', label: 'Assigned' },
  picked_up: { color: 'cyan', label: 'Picked up' },
  in_transit: { color: 'processing', label: 'In transit' },
  reached: { color: 'geekblue', label: 'Reached' },
  // invoices
  unpaid: { color: 'warning', label: 'Unpaid' },
  partial: { color: 'gold', label: 'Partly paid' },
  paid: { color: 'success', label: 'Paid' },
  overdue: { color: 'error', label: 'Overdue' },
  // risk
  green: { color: 'success', label: 'On track' },
  amber: { color: 'warning', label: 'At risk' },
  red: { color: 'error', label: 'Late' },
};
export const statusOf = (key) => STATUS[key] ?? { color: 'default', label: key };
```

### 4.6 `lib/format.js`

```js
import dayjs from 'dayjs';
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const formatINR = (v) => (v == null ? '—' : inr.format(v));
export const formatQty = (v, uom) => (v == null ? '—' : `${num.format(v)} ${uom ?? ''}`.trim());
export const formatDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const formatTime = (d) => (d ? dayjs(d).format('HH:mm') : '—');
export const formatPct = (v) => (v == null ? '—' : `${num.format(v)}%`);
```

---

## 5. Contexts and hooks

### 5.1 `context/AuthContext.jsx`

```jsx
import { createContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) => supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    }),
    resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    }),
    signOut: () => supabase.auth.signOut(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

### 5.2 `context/OrgContext.jsx`

Loads `GET /me/orgs` and, for the selected org, `GET /me/orgs/:id/context` (role, permissions, scope, types, modules). Stores the selected org id in `localStorage` (`sameta.orgId`, wrapped in try/catch) and calls `setApiOrg()`.

```jsx
import { createContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setApiOrg } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export const OrgContext = createContext(null);
const KEY = 'sameta.orgId';
const readSaved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = (id) => { try { localStorage.setItem(KEY, id); } catch { /* ignore */ } };

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState(readSaved);

  const orgsQ = useQuery({
    queryKey: ['me', 'orgs'],
    queryFn: () => api.get('/me/orgs').then((r) => r.data),
    enabled: !!user,
  });

  // pick a default org if none saved or saved one is gone
  useEffect(() => {
    const list = orgsQ.data ?? [];
    if (list.length && !list.some((o) => o.id === orgId)) setOrgId(list[0].id);
  }, [orgsQ.data, orgId]);

  useEffect(() => { setApiOrg(orgId); if (orgId) save(orgId); }, [orgId]);

  const ctxQ = useQuery({
    queryKey: ['me', 'context', orgId],
    queryFn: () => api.get(`/me/orgs/${orgId}/context`).then((r) => r.data),
    enabled: !!user && !!orgId,
  });

  const value = useMemo(() => ({
    orgs: orgsQ.data ?? [],
    loading: orgsQ.isLoading || (!!orgId && ctxQ.isLoading),
    orgId,
    org: ctxQ.data?.org ?? null,                  // { id, name, types, connect_code, modules }
    role: ctxQ.data?.role ?? null,                // { name, rank }
    permissions: new Set(ctxQ.data?.permissions ?? []),
    scope: ctxQ.data?.scope ?? {},
    switchOrg: (id) => { setOrgId(id); qc.clear(); },   // drop cached data of the old org
  }), [orgsQ.data, orgsQ.isLoading, ctxQ.data, ctxQ.isLoading, orgId, qc]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
```

> Backend needs `GET /me/orgs/:id/context` — same data as the tenant middleware builds (`req.ctx`), returned to the client. Add it to the `me` routes.

### 5.3 `hooks/usePermission.js` and `<Can>`

```js
import { useOrg } from './useOrg';

export function usePermission() {
  const { permissions, org, scope } = useOrg();
  return {
    can: (...perms) => perms.some((p) => permissions.has(p)),
    canAll: (...perms) => perms.every((p) => permissions.has(p)),
    isType: (t) => org?.types?.includes(t),
    inScope: (kind, id) => {
      const ids = scope?.[`${kind}_ids`];
      return !ids || ids.length === 0 || ids.includes(id);
    },
  };
}
```

```jsx
// components/common/Can.jsx
import { usePermission } from '@/hooks/usePermission';
export default function Can({ perm, anyOf, children, fallback = null }) {
  const { can } = usePermission();
  const list = anyOf ?? [perm];
  return can(...list) ? children : fallback;
}
```

Usage: `<Can perm="dispatch.confirm"><Button>Confirm dispatch</Button></Can>`.

### 5.4 `context/SocketContext.jsx` and `useSocketEvent`

```jsx
import { createContext, useEffect, useState } from 'react';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { session } = useAuth();
  const { orgId } = useOrg();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!session?.access_token || !orgId) return undefined;
    const s = connectSocket({ token: session.access_token, orgId });
    setSocket(s);
    return () => s.disconnect();
  }, [session?.access_token, orgId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
```

```js
// hooks/useSocketEvent.js
import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '@/context/SocketContext';

export function useSocketEvent(event, handler) {
  const socket = useContext(SocketContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const fn = (data) => ref.current(data);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

// watch a specific order room (order detail, buyer tracking)
export function useWatchOrder(orderId) {
  const socket = useContext(SocketContext);
  useEffect(() => {
    if (!socket || !orderId) return undefined;
    socket.emit('order:watch', orderId);
    return () => socket.emit('order:unwatch', orderId);
  }, [socket, orderId]);
}
```

### 5.5 `main.jsx`

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ConfigProvider, App as AntApp } from 'antd';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/context/AuthContext';
import { OrgProvider } from '@/context/OrgContext';
import { SocketProvider } from '@/context/SocketContext';
import { theme } from '@/styles/theme';
import { router } from '@/router';
import '@/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OrgProvider>
              <SocketProvider>
                <RouterProvider router={router} />
              </SocketProvider>
            </OrgProvider>
          </AuthProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
```

---

## 6. Routing and guards

### 6.1 Guards

| Guard | Rule | On fail |
|---|---|---|
| `ProtectedRoute` | Session exists | → `/login?next=<path>` |
| `OrgRequired` | User has ≥ 1 org and a selected org context loaded | no orgs → `/onboarding`; loading → full-page spinner |
| `PortalGuard types=[...]` | Selected org has one of the types | → `homeFor(org, role)` |
| `PermissionGuard anyOf=[...]` | User has one of the permissions | 403 page with "Ask your owner for access" |
| `PlatformAdminGuard` | `/me` says `is_platform_admin` | → `/` |

### 6.2 `config/portals.js`

```js
export function homeFor(org, role, permissions) {
  if (!org) return '/onboarding';
  const t = org.types;
  if (t.includes('manufacturer')) {
    if (role?.name === 'Machine Operator') return '/floor/machine';
    if (role?.name === 'QC Inspector') return '/floor/qc';
    if (role?.name === 'Gate Security') return '/floor/gate';
    if (role?.name === 'Maintenance Technician') return '/floor/maintenance';
    if (role?.name === 'Shift Supervisor') return '/floor/supervisor';
    return '/app/dashboard';
  }
  if (t.includes('transporter')) return permissions.has('trip.drive') && !permissions.has('transport.manage')
    ? '/driver/trips' : '/transport/trips';
  if (t.includes('supplier')) return '/supplier/pos';
  if (t.includes('buyer')) return '/buyer/orders';
  return '/app/dashboard';
}
```

### 6.3 Route tree (`router.jsx`)

Each portal is lazy-loaded (`React.lazy`) so floor phones don't download office screens.

```
/                               LandingPage                         PublicLayout
/login  /signup  /forgot  /reset-password  /auth/callback           AuthLayout
/invite/staff/:token  /invite/partner/:token                        AuthLayout (+ ProtectedRoute on accept)
/track/:token                   PublicTrackPage                     (no auth)
/kiosk                          KioskPage                           KioskLayout (device token, no user login)

ProtectedRoute
  /onboarding                   OnboardingWizard
  /select-org                   SelectOrgPage
  /home                         redirect → homeFor()

  OrgRequired
    /app/*      PortalGuard(manufacturer)   AppLayout          (see §11)
    /floor/*    PortalGuard(manufacturer)   FloorLayout        (see §12)
    /buyer/*    PortalGuard(buyer)          PortalLayout       (see §13)
    /supplier/* PortalGuard(supplier)       PortalLayout
    /transport/* PortalGuard(transporter)   PortalLayout
    /driver/*   PortalGuard(transporter)    DriverLayout

  PlatformAdminGuard
    /admin/*                    AdminLayout                        (see §14)

*                               NotFoundPage
```

Example:

```jsx
// router.jsx (excerpt)
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/guards/ProtectedRoute';
import OrgRequired from '@/guards/OrgRequired';
import PortalGuard from '@/guards/PortalGuard';
import PermissionGuard from '@/guards/PermissionGuard';
import PageSpinner from '@/components/common/PageSpinner';

const AppLayout = lazy(() => import('@/layouts/AppLayout'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const OrdersListPage = lazy(() => import('@/features/orders/pages/OrdersListPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'));
// ...

const s = (el) => <Suspense fallback={<PageSpinner />}>{el}</Suspense>;
const guard = (anyOf, el) => <PermissionGuard anyOf={anyOf}>{s(el)}</PermissionGuard>;

export const router = createBrowserRouter([
  // public + auth routes ...
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/onboarding', element: s(<OnboardingWizard />) },
      {
        element: <OrgRequired />,
        children: [
          {
            path: '/app',
            element: <PortalGuard types={['manufacturer']}>{s(<AppLayout />)}</PortalGuard>,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: s(<DashboardPage />) },
              { path: 'orders', element: guard(['orders.view'], <OrdersListPage />) },
              { path: 'orders/:id', element: guard(['orders.view'], <OrderDetailPage />) },
              // ... all routes from §11
            ],
          },
          // /floor, /buyer, /supplier, /transport, /driver ...
        ],
      },
    ],
  },
]);
```

---

## 7. Layouts and navigation

### 7.1 `AppLayout` (mill office, desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰ Sameta    [Everest Textile Mills ▾]   🔍 Search     🔔 3   🤖  👤  │  topbar
├────────────┬─────────────────────────────────────────────────────────┤
│ sidebar    │  PageHeader (title, breadcrumbs, actions)               │
│ (from      │  ─────────────────────────────────────────────────────  │
│ nav.mill)  │  <Outlet />                                             │
│            │                                   ┌──────────────┐      │
│            │                                   │ 🤖 Ask mill  │      │
└────────────┴───────────────────────────────────┴──────────────┴──────┘
```
- Ant Design `Layout` + `Sider` (collapsible; drawer on < 992 px) + `Menu`.
- Topbar: `OrgSwitcher`, global search (order no., roll no., worker code), `NotificationBell`, AI button, `UserMenu` (profile, switch org, sign out).
- Floating `ChatWidget` shown when the user has `ai.chat`.

### 7.2 Navigation config (`config/nav.mill.js`)

```js
import { DashboardOutlined, ShoppingCartOutlined, InboxOutlined /* ... */ } from '@ant-design/icons';

export const millNav = [
  { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlined, to: '/app/dashboard' },
  { key: 'orders', label: 'Orders', icon: ShoppingCartOutlined, to: '/app/orders', anyOf: ['orders.view'] },
  { key: 'inventory', label: 'Inventory', icon: InboxOutlined, anyOf: ['stock.view'], children: [
      { key: 'stock', label: 'Stock', to: '/app/inventory/stock' },
      { key: 'receipts', label: 'Goods receipts', to: '/app/inventory/receipts', anyOf: ['receipt.create'] },
      { key: 'items', label: 'Items', to: '/app/catalog/items', anyOf: ['items.view'] },
      { key: 'bom', label: 'BOM', to: '/app/catalog/boms', anyOf: ['bom.view'] },
      { key: 'calc', label: 'Material calculator', to: '/app/catalog/calculator', anyOf: ['bom.view'] },
      { key: 'adjust', label: 'Adjustments', to: '/app/inventory/adjustments', anyOf: ['stock.adjust'] },
  ]},
  { key: 'procurement', label: 'Purchase', anyOf: ['po.view'], children: [
      { key: 'pos', label: 'Purchase orders', to: '/app/procurement/purchase-orders' },
  ]},
  { key: 'production', label: 'Production', anyOf: ['production.view'], children: [
      { key: 'board', label: 'Machine board', to: '/app/production/board' },
      { key: 'planning', label: 'Planning', to: '/app/production/planning', anyOf: ['production.plan'] },
      { key: 'wos', label: 'Work orders', to: '/app/production/work-orders' },
      { key: 'assign', label: 'Assignments', to: '/app/production/assignments', anyOf: ['assignment.manage'] },
      { key: 'machines', label: 'Machines', to: '/app/production/machines' },
      { key: 'tickets', label: 'Maintenance', to: '/app/maintenance/tickets', anyOf: ['breakdown.report', 'maintenance.fix'] },
  ]},
  { key: 'quality', label: 'Quality', to: '/app/quality', anyOf: ['qc.view'] },
  { key: 'gate', label: 'Gate register', to: '/app/gate', anyOf: ['gate.view'] },
  { key: 'dispatch', label: 'Dispatch', to: '/app/dispatch', anyOf: ['dispatch.view'] },
  { key: 'workforce', label: 'Workforce', anyOf: ['attendance.view', 'workers.manage'], children: [
      { key: 'today', label: 'Attendance today', to: '/app/workforce/attendance/today' },
      { key: 'register', label: 'Monthly register', to: '/app/workforce/attendance/register' },
      { key: 'workers', label: 'Workers', to: '/app/workforce/workers', anyOf: ['workers.manage'] },
      { key: 'leave', label: 'Leave & corrections', to: '/app/workforce/requests', anyOf: ['attendance.approve'] },
      { key: 'wages', label: 'Wages', to: '/app/workforce/wages', anyOf: ['wages.view'] },
  ]},
  { key: 'finance', label: 'Accounts', anyOf: ['invoice.view'], children: [
      { key: 'invoices', label: 'Sales invoices', to: '/app/finance/invoices' },
      { key: 'bills', label: 'Bills', to: '/app/finance/bills' },
      { key: 'payments', label: 'Payments', to: '/app/finance/payments' },
      { key: 'expenses', label: 'Expenses', to: '/app/finance/expenses', anyOf: ['expense.manage'] },
      { key: 'ar', label: 'Receivables', to: '/app/finance/receivables' },
      { key: 'ap', label: 'Payables', to: '/app/finance/payables' },
  ]},
  { key: 'reports', label: 'Reports', anyOf: ['reports.production', 'reports.qc', 'reports.cost', 'reports.pnl', 'reports.attendance'], children: [
      { key: 'cost', label: 'Cost per order', to: '/app/reports/order-cost', anyOf: ['reports.cost'] },
      { key: 'pnl', label: 'Monthly P&L', to: '/app/reports/pnl', anyOf: ['reports.pnl'] },
      { key: 'machines', label: 'Machine production', to: '/app/reports/machines', anyOf: ['reports.production'] },
      { key: 'wastage', label: 'Wastage', to: '/app/reports/wastage', anyOf: ['reports.production'] },
      { key: 'qc', label: 'Quality', to: '/app/reports/qc', anyOf: ['reports.qc'] },
      { key: 'att', label: 'Attendance', to: '/app/reports/attendance', anyOf: ['reports.attendance'] },
  ]},
  { key: 'partners', label: 'Partners', to: '/app/partners', anyOf: ['partners.view'] },
  { key: 'ai', label: 'Ask Sameta', to: '/app/ai', anyOf: ['ai.chat'] },
  { key: 'settings', label: 'Settings', to: '/app/settings/org', anyOf: ['settings.manage', 'staff.view', 'roles.manage'] },
];
```

`AppLayout` filters items with `usePermission().can(...)` and drops empty groups.

### 7.3 `FloorLayout` (phone / tablet)

```
┌─────────────────────────┐
│ Everest · W-3 · Shift A │  compact header (org, area, shift, sign out)
├─────────────────────────┤
│                         │
│       <Outlet />        │  one task per screen
│                         │
├─────────────────────────┤
│ 🏭 Machine  ✅ QC  📦 …   │  bottom nav (only items the role can use)
└─────────────────────────┘
```

`nav.floor.js` items: Machine (`production.log`), Supervisor (`assignment.manage`), QC (`qc.inspect`), Receive (`receipt.create`), Dispatch scan (`dispatch.create`), Maintenance (`maintenance.fix`), Gate (`gate.log`), Attendance (`attendance.mark`).

### 7.4 Other layouts

| Layout | Notes |
|---|---|
| `PortalLayout` | Top navigation bar (buyer / supplier / transport), org switcher, bell; collapses to a drawer on phones |
| `DriverLayout` | Like FloorLayout; bottom nav: My trips, Profile |
| `KioskLayout` | Full-screen, no navigation, large clock, wake-lock (`navigator.wakeLock` in try/catch) |
| `AdminLayout` | Simple sidebar: Organizations, Usage, Announcements |
| `AuthLayout` | Centered card, product name and tagline |
| `PublicLayout` | Landing navbar + footer |

---

## 8. Design system

### 8.1 Theme (`styles/theme.js`)

```js
export const theme = {
  token: {
    colorPrimary: '#3B5BDB',
    colorSuccess: '#2F9E44',
    colorWarning: '#F08C00',
    colorError: '#E03131',
    colorInfo: '#1C7ED6',
    borderRadius: 8,
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
  },
  components: {
    Button: { controlHeightLG: 56, fontSizeLG: 18 },   // floor BigButtons use size="large"
    Table: { headerBg: '#F8F9FA' },
  },
};
```

### 8.2 Status colour meaning (everywhere)

| Colour | Means |
|---|---|
| 🟢 green | running · passed · paid · present · delivered · on track |
| 🟡 amber | idle · pending · late · at risk · partial |
| 🔴 red | breakdown · rejected · overdue · absent · late order |
| 🔵 blue | in QC · rework · in transit · processing |
| ⚪ grey | draft · cancelled · leave |

Always pair colour with a text label or icon (colour-blind friendly).

### 8.3 Layout rules

- Page = `PageHeader` → optional `KpiRow` (2–5 `KpiCard`s) → content (`SectionCard`s, tables, charts).
- Max 2 clicks from any page to its main action.
- Tables: search + filters in `FilterBar` above; pagination from server `meta`; row click opens detail.
- Desktop office screens: min width 1280 px design, still usable at 1024 px.
- Floor / kiosk / driver: design at 360 × 740 px; buttons ≥ 56 px tall; fonts ≥ 16 px (key numbers 24–32 px); no tables wider than the screen (use cards).

---

## 9. Data fetching patterns

### 9.1 Query keys

```
['me','orgs'] · ['me','context',orgId]
[orgId,'orders',params] · [orgId,'order',id] · [orgId,'order',id,'requirements']
[orgId,'stock',params] · [orgId,'machines','board'] · [orgId,'work-orders',params]
[orgId,'qc','queue',status] · [orgId,'roll',rollNo,'trace']
[orgId,'dispatch',id] · [orgId,'trips',params] · [orgId,'attendance','today',params]
[orgId,'reports',name,params] · [orgId,'notifications'] · [orgId,'ai','chat',chatId]
```

Prefix every tenant key with `orgId` so switching org never shows stale data (we also `queryClient.clear()` on switch).

### 9.2 Feature `queries.js` example

```js
// features/orders/queries.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useOrg } from '@/hooks/useOrg';
import * as api from './api';

export function useOrders(params) {
  const { orgId } = useOrg();
  return useQuery({ queryKey: [orgId, 'orders', params], queryFn: () => api.listOrders(params) });
}

export function useOrder(id) {
  const { orgId } = useOrg();
  return useQuery({ queryKey: [orgId, 'order', id], queryFn: () => api.getOrder(id), enabled: !!id });
}

export function useConfirmOrder(id) {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.confirmOrder(id),
    onSuccess: () => {
      message.success('Order confirmed');
      qc.invalidateQueries({ queryKey: [orgId, 'order', id] });
      qc.invalidateQueries({ queryKey: [orgId, 'orders'] });
    },
  });
}
```

```js
// features/orders/api.js
import { api } from '@/lib/api';
export const listOrders = (params) => api.get('/orders', { params });     // → { data, meta }
export const getOrder = (id) => api.get(`/orders/${id}`).then((r) => r.data);
export const confirmOrder = (id) => api.post(`/orders/${id}/confirm`).then((r) => r.data);
export const getRequirements = (id) => api.get(`/orders/${id}/requirements`).then((r) => r.data);
```

### 9.3 Mutation rules

- Show a toast on success; errors are shown by the global `onError` (uses the API message).
- Business errors with codes are shown inline where they matter (e.g. dispatch scan list shows `ROLL_ALREADY_DISPATCHED` as a red row, not a toast).
- Disable the submit button while `isPending`.
- Destructive actions use `ConfirmButton` (Popconfirm).

### 9.4 Mock-first development

Until an endpoint exists, `api.js` functions can return fixtures from `features/<x>/mocks.js` behind `import.meta.env.VITE_USE_MOCKS === 'true'`. Shapes must match the agreed API contract in the backend doc §10.

---

## 10. Shared components

| Component | Props | Notes |
|---|---|---|
| `PageHeader` | `title, subtitle, breadcrumbs, actions` | Actions on the right |
| `KpiCard` | `label, value, suffix, delta, status, icon, onClick` | `status` colours the left border |
| `KpiRow` | `children` | Responsive grid, 2 → 5 columns |
| `DataTable` | AntD Table props + `query` (TanStack result), `onRowClick`, `exportPath` | Handles loading / empty / error, server pagination via `useUrlState` |
| `FilterBar` | `filters` config (`select`, `dateRange`, `search`) | Syncs to URL params |
| `StatusBadge` | `status` | Uses `lib/status.js` |
| `MoneyText` | `value, perm='orders.view_price'` | Renders `—` if the user lacks the permission |
| `QtyText` | `value, uom` | |
| `DateText` | `value, withTime` | |
| `EmptyState` / `ErrorState` | `title, description, action` | |
| `ConfirmButton` | `title, onConfirm, danger` | |
| `Can` | `perm` or `anyOf` | |
| `OrgSwitcher` | — | Lists `orgs`, shows type tags |
| `NotificationBell` | — | Badge count, dropdown list, mark read; listens to `notification.new` |
| `CopyField` | `value, label` | For connect code, tracking link |
| `FileUpload` | `bucket, onUploaded` | Calls `/uploads/sign`, uploads, returns `path`; camera capture on phones (`accept="image/*" capture="environment"`) |
| `BigButton` | AntD Button `size="large" block` + icon | Floor screens |
| `StageStepper` | `stages, current, progressByStage` | Order + buyer views |
| `OrderTimeline` | `events` | AntD Timeline |
| `ProgressCell` | `pct` | Thin bar + number |
| `RiskChip` | `risk` | 🟢🟡🔴 |
| `AvailabilityPanel` | `requirements` | Required / in stock / reserved / available / short + actions |
| `RequirementTree` | `tree` | AntD Tree; node shows item, qty, from stock, to make/buy, wastage, status |
| `MachineCard` | `machine` | Status colour, order, %, operator, today qty, breakdown timer |
| `MachineBoard` | `machines, groupBy='stage'` | Columns per stage |
| `RollTraceTimeline` | `trace` | Yarn lot → stages → QC → order → buyer |
| `DefectCounter` | `defectTypes, value, onChange` | − / + buttons per defect |
| `AttendanceCell` | `status, lateMin, ot` | Letter code P / A / H / L / OT with colour |
| `RegisterGrid` | `workers, days, data` | Sticky first column, horizontal scroll inside the card |
| `TripStepper` | `trip` | Requested → … → Delivered |
| `QrScanner` / `QrLabel` / `QrLabelSheet` / `PrintButton` | see §15 | |
| `ChartFromSpec` | `spec, rows` | Renders bar / line / pie / table / kpi from the AI chart spec |
| `ChatWidget`, `InsightCard` | see §17 | |

---

## 11. Screen specs — Mill office

Format: **route** · permission · API · what it shows · actions.

### 11.1 Dashboard — `/app/dashboard`

- **API:** `GET /reports/dashboard` (role-aware blocks), `GET /ai/insights`, `GET /notifications?limit=5`.
- **Shows (owner):**
  ```
  ┌ Today's output ┐┌ Running ┐┌ Idle/Down ┐┌ Orders at risk ┐┌ Present today ┐┌ Profit this month ┐
  │  4,820 m       ││ 14/20   ││  4 / 2    ││     3 🔴       ││   46/50       ││  ₹6.4 L  ▲12%     │
  └────────────────┘└─────────┘└───────────┘└────────────────┘└───────────────┘└───────────────────┘
  ┌ Production last 7 days (bar by stage) ─┐┌ AI insights ───────────────────────────┐
  └────────────────────────────────────────┘│ ⚠ W-3 colour mismatch 18% (avg 4%)      │
  ┌ Alerts: low stock 2 · breakdown D-2 ·  ┐│ 📦 Cotton 30s Red runs out in ~5 days   │
  │ overdue ₹3.1 L · unmoved rolls 6       ┘│ 🔴 ORD-0142 may miss deadline           │
                                             └────────────────────────────────────────┘
  ```
- Each block renders only if the API returned it (backend checks permissions). Supervisors see their area; accounts see finance blocks; sales sees orders.
- Live: `machine.updated`, `production.logged`, `order.status_changed` → invalidate dashboard.

### 11.2 Orders

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/orders` | `orders.view` | Tabs: All / In production / In QC / Ready / Dispatched / At risk; Sales / Purchase toggle; table Order · Buyer · Fabric · Qty · Deadline · Stage · Progress · Risk · Status | [New order] |
| `/app/orders/new` | `orders.create` | Buyer (partner or contact), lines (fabric item, colour, qty, uom, rate), deadline, priority, address | Save draft · Save & check material |
| `/app/orders/:id` | `orders.view` | Header (status, risk, deadline, buyer, [Copy tracking link]); tabs **Overview** (StageStepper, per-stage %, rolls summary) · **Requirements** (RequirementTree + AvailabilityPanel) · **Production** (work orders per stage) · **Rolls** · **Dispatches** · **Invoices** · **Timeline** | [Confirm] [Reserve] [Create PO for shortage] [Plan production] [Cancel] |

Live: `useWatchOrder(id)` + `order.status_changed`.

### 11.3 Catalog and BOM

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/catalog/items` | `items.view` | Kind tabs; Name · Colour · Count / GSM / Width · UOM · Reorder · Std rate | Add / edit (`items.manage`) |
| `/app/catalog/boms` | `bom.view` | BOM list per output item | New BOM |
| `/app/catalog/boms/:id` | `bom.manage` | BOM editor: output item + qty + stage; lines (component, qty, uom, wastage %, warp/weft); live "per 1 unit" preview; **converter helper** (metres × width × GSM → kg; yarn Ne → length) from `lib/textile.js` | Save |
| `/app/catalog/calculator` | `bom.view` | Product + quantity + [✓ use current stock] → `GET /bom/explode`; RequirementTree; summary (total waste %, material cost, cost per unit) | [Create order] [Create PO for shortages] [Export PDF] |

Calculator wireframe:

```
Product: [Shirt – Twill Red ▾]  Quantity: [1000]  [✓ Use current stock]  [Calculate]
👕 Shirt ×1000
└─ ✂ Finished Twill Red   1,778 m   stock 200 m  → produce 1,578 m   waste 10%
   └─ 🎨 Grey Twill        1,644 m   stock 0      → weave 1,644 m     loss 4% / 5%
      ├─ 🧶 Yarn 40s (warp) 166 kg ┐ stock 210 kg shared → short 92 kg ❌
      ├─ 🧶 Yarn 40s (weft) 136 kg ┘
      │  └─ 🌀 Cotton fibre 105 kg   stock 500 kg ✅
      └─ 🎨 Reactive dye    5.9 kg   stock 10 kg  ✅
Summary: total loss 27% · material ₹1,84,200 · ₹184 per shirt
```

### 11.4 Inventory and procurement

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/inventory/stock` | `stock.view` | KPI (total yarn, low items, reserved, finished fabric); tabs Raw / Finished / Lots / Movements; table with Days left + status; stock trend chart | [+ Receive yarn] [Adjust] [Create PO] [Export] |
| `/app/inventory/receipts` | `stock.view` | GRN list | [New GRN] |
| `/app/inventory/receipts/new` (and `?dispatch=` pre-fill) | `receipt.create` | Supplier, vehicle no., PO / dispatch link, lines (item, colour, lot no., expected, received, rate, for order) | [Save draft] [Post GRN] → toast "Stock updated" |
| `/app/inventory/adjustments` | `stock.adjust` | Adjustment list (pending / approved) | New, approve (`stock.adjust_approve`) |
| `/app/procurement/purchase-orders` | `po.view` | PO list with status; supplier scorecard drawer | [New PO] [Send] |
| `/app/procurement/purchase-orders/:id` | `po.view` | Lines, supplier response, linked dispatch, GRN | Send · Cancel |

### 11.5 Production and maintenance

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/production/board` | `production.view` | KPI (running / idle / breakdown / today / utilisation); `MachineBoard` by stage; **TV mode** toggle (full screen, auto-refresh, larger cards) | Click card → drawer with work order, logs today, events |
| `/app/production/planning` | `production.plan` | Left: unassigned work orders (by order, stage, target, due); right: machine columns with load & estimated finish; drag & drop (AntD + HTML5 DnD, or click "Assign to…") | Assign · Reorder · Unassign |
| `/app/production/work-orders` | `production.view` | Table WO · Order · Stage · Machine · Target · Produced · % · Status | Open detail |
| `/app/production/assignments` | `assignment.manage` | Date + shift → grid machines × assigned worker; present workers list (from attendance) | [Copy yesterday] [Save] |
| `/app/production/machines` | `production.view` | Machine master | Add / edit (`settings.manage`) |
| `/app/maintenance/tickets` | `breakdown.report` / `maintenance.fix` | Ticket list (Open / In progress / Resolved), downtime Pareto chart | Start · Resolve |

Machine card:

```
┌ W-3 🟢 Running ───────┐
│ ORD-0142 Twill Red    │
│ ▓▓▓▓▓▓▓▓▓░ 92%        │
│ Anil · Shift A        │
│ Today 540 m           │
└───────────────────────┘
```

### 11.6 Quality and traceability

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/quality` | `qc.view` | KPI (pending, passed today, rework, rejected, first-pass yield); tabs Pending / Passed / Rework / Rejected; charts: defects by machine (bar), by type (pie), trend (line) | Open roll · [Inspect] (desktop version of the QC station) · Override (`qc.override`) |
| `/app/rolls/:rollNo` | `qc.view` | `RollTraceTimeline` + insight line ("8 of 11 rejected rolls this week from W-3 + batch B7") + photos | Print label |

### 11.7 Gate and dispatch

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/gate` | `gate.view` | Register: Time · Vehicle · In/Out · Party · Linked doc · Guard | — |
| `/app/dispatch` | `dispatch.view` | Dispatch list; Ready-to-ship orders panel | [New dispatch] |
| `/app/dispatch/new` | `dispatch.create` | Order (ready / partly ready), buyer, transporter (connected) or vehicle + driver fields | Create → goes to scan screen |
| `/app/dispatch/:id` | `dispatch.view` | Scan screen (below) | [Packing list PDF] [Confirm & invoice] (`dispatch.confirm`) |

```
DSP-0081 · ORD-0142 · Shree Fabrics, Surat · Transporter: Gujarat Roadlines
Ordered 1200 m │ Scanned 860 m (17 rolls) │ Remaining 340 m
[📷 Scan roll]  [or type roll no. ____ ]
✅ R-0142-001  52 m                         [remove]
❌ R-0137-004  Belongs to another order
❌ R-0142-009  Already dispatched in DSP-0079
❌ R-0142-011  QC not passed (Rework)
[Packing list PDF]   [Confirm dispatch & generate invoice]
```

Failed scans stay in a local list (not saved) so the user sees why. Play a short success / error beep (Web Audio, optional).

### 11.8 Workforce

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/workforce/attendance/today` | `attendance.view` | KPI (present, absent, late, leave, OT); per shift × stage counts; absent list with [Reassign] | Mark (`attendance.mark`) |
| `/app/workforce/attendance/register` | `attendance.view` | `RegisterGrid` month view (P/A/H/L/OT + totals) | Export CSV · click cell → correction request |
| `/app/workforce/workers` | `workers.manage` | Worker list: Code · Name · Stage · Shift · Wage type · Rate · Active | Add · Edit · [Print badges] (QrLabelSheet) |
| `/app/workforce/workers/:id` | `workers.manage` | Profile, badge, attendance history, production history, wages | Edit |
| `/app/workforce/requests` | `attendance.approve` | Tabs Corrections / Leave / OT approvals | Approve · Reject |
| `/app/workforce/wages` | `wages.view` | Wage runs by month; run detail table (Worker · Type · Days · Hours · OT · Pieces · Gross · Advance · Net); totals | [Prepare run] (`wages.run`) · [Approve] · [Mark paid] (`wages.pay`) · Payslip PDF |

### 11.9 Finance

| Route | Perm | Shows |
|---|---|---|
| `/app/finance/invoices` | `invoice.view` | Sales invoices: No · Buyer · Order · Date · Due · Total · Paid · Status; PDF |
| `/app/finance/bills` | `invoice.view` | Supplier + freight bills (`side=purchase`) + offline supplier bills |
| `/app/finance/payments` | `invoice.view` | Payments in / out; [Record payment] (`payment.record`) |
| `/app/finance/expenses` | `expense.manage` | Expense list + form |
| `/app/finance/receivables` | `invoice.view` | KPI (receivable, overdue, collected this month); ageing chart (0–30 / 31–60 / 60+); list |
| `/app/finance/payables` | `invoice.view` | Same for payables |

### 11.10 Reports

| Route | Perm | Shows |
|---|---|---|
| `/app/reports/order-cost` | `reports.cost` | Table Order · Revenue · Material · Labour · Machine · Freight · Reject loss · Total cost · Profit · Margin %; sort by margin; stacked bar of cost breakdown; click → order detail |
| `/app/reports/pnl` | `reports.pnl` | Month picker; P&L statement (below); 12-month line chart of revenue vs. cost vs. profit |
| `/app/reports/machines` | `reports.production` | Per machine output, run hours, idle, downtime, utilisation %, defect %; bar chart |
| `/app/reports/wastage` | `reports.production` | Planned vs. actual by stage (grouped bar) + by machine / order; extra cost column |
| `/app/reports/qc` | `reports.qc` | Yield, rejection %, defects by machine / type / supplier |
| `/app/reports/attendance` | `reports.attendance` | Attendance %, lates, absenteeism by shift, OT hours |

```
October 2026
Revenue                 ₹ 42.6 L
– Raw material          ₹ 21.3 L
– Wages                 ₹  7.8 L
– Machine / power       ₹  4.1 L
– Freight               ₹  0.9 L
– Other expenses        ₹  2.0 L
= NET PROFIT            ₹  6.5 L  (15.3%)  ✅ The mill made money   ▲ vs Sep ₹5.8 L
```

All reports: date range in `FilterBar`, [Export CSV], loading skeletons.

### 11.11 Partners and settings

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/app/partners` | `partners.view` | Connect code card (`CopyField`); tabs Buyers / Suppliers / Transporters / Pending / Offline contacts | [Connect with code] [Invite by email] (`partners.connect`) · Accept / Reject / Block (`partners.approve`) |
| `/app/settings/org` | `settings.manage` | Org profile, logo, GSTIN, address | Save |
| `/app/settings/modules` | `settings.manage` | Module toggles | Save |
| `/app/settings/stages` | `settings.manage` | Stages + stage losses (weight %, shrink %) | Add / reorder |
| `/app/settings/shifts` | `settings.manage` | Shifts with grace time | |
| `/app/settings/defects` | `settings.manage` | Defect types | |
| `/app/settings/staff` | `staff.view` | Staff table (name, email, role, scope, reports to, status); pending invites | [Invite] (`staff.invite`) · Edit role / scope (`staff.edit_role`) |
| `/app/settings/roles` | `roles.manage` | Role list; role editor = permission checklist grouped by domain, 🔒 marks, rank | Create / edit custom role |
| `/app/settings/kiosk` | `settings.manage` | Kiosk devices | [Add device] → shows the token / QR once to set up the tablet |
| `/app/settings/audit` | `roles.manage` | Audit log with filters | — |

Scope picker (in staff edit drawer): multi-selects for stages, machines, shifts, warehouses; empty = whole org.

---

## 12. Screen specs — Floor, kiosk

### 12.1 Operator — `/floor/machine` (`production.log`)

- **API:** `GET /production/board?mine=true` (the machine assigned to me for this shift), work order actions.
- **Shows:** machine, shift, my name, order, fabric, colour, target vs. done bar.
- **Buttons:** `+ ADD PRODUCTION` (number pad modal, uom shown) · `CREATE ROLL` (final stage only: length, weight, dye batch → prints label) · `PAUSE / RESUME` · `BREAKDOWN` (reason grid: Motor, Yarn break, Power, Electrical, Other) · `START` when idle · `FINISH` (good qty, weight, waste qty + type).
- Machine picker if the operator has more than one assigned machine.

```
┌─────────────────────────┐
│ W-3 · Shift A · Anil    │
│ ORD-0142  Twill Red     │
│ Target 1200 m           │
│ ▓▓▓▓▓▓▓▓░░  920 / 1200  │
│ [   + ADD PRODUCTION  ] │
│ [   CREATE ROLL 🏷     ] │
│ [ PAUSE ] [ BREAKDOWN ] │
└─────────────────────────┘
```

### 12.2 Supervisor — `/floor/supervisor` (`assignment.manage`)

- Present / late counts for my area; absent list with [Reassign] (pick a present unassigned worker → `POST /assignments`).
- My machines list (status, operator, %); tap → actions (assign, close breakdown).
- Tabs: Board · Attendance (bulk grid for my workers: mark all present → exceptions) · Breakdowns · QC view.

### 12.3 QC station — `/floor/qc` (`qc.inspect`)

```
┌─────────────────────────┐
│ [ 📷 Scan roll QR ]     │
│ R-0142-017 · 52 m       │
│ ORD-0142 · W-3 · Dye B7 │
│ Hole        [-] 1 [+]   │
│ Colour      [-] 0 [+]   │
│ Uneven      [-] 0 [+]   │
│ Stain       [-] 0 [+]   │
│ [ 📸 Add photo ]        │
│ [PASS] [REWORK] [REJECT]│
└─────────────────────────┘
```

- After submit: green / blue / red full-screen flash for 1 s, then back to scan.
- Queue count badge at the top (live via `qc.queue_changed`).

### 12.4 Store receive — `/floor/store/receive` (`receipt.create`)

Pick an expected supplier dispatch (from `GET /gate/expected`) or scan its gate pass → pre-filled lines → edit received qty → [Post GRN].

### 12.5 Dispatch scan — `/floor/dispatch/:id` (`dispatch.create`)

Phone version of §11.7: camera always on, list below, totals sticky at the top.

### 12.6 Maintenance — `/floor/maintenance` (`maintenance.fix`)

My open tickets (machine, reason, since) → [Start] → [Resolve] (resolution text, parts used).

### 12.7 Gate — `/floor/gate` (`gate.log`)

`[VEHICLE IN]` `[VEHICLE OUT]` → vehicle no. (keyboard or scan gate pass) → match expected dispatch / outgoing dispatch → purpose → save → ✅. Today's register below.

### 12.8 Kiosk — `/kiosk`

- **Setup (first open):** "Scan setup code" → scans the device QR shown in Settings → Kiosk → stores the device token in `localStorage` (try/catch; if storage is blocked, show "This browser cannot remember the device" and keep the token in memory for the session).
- **Normal mode:**

```
┌──────────────────────────────────────┐
│      EVEREST TEXTILE MILLS · 06:04   │
│   ┌──────────────────────────────┐   │
│   │      [ camera preview ]      │   │
│   │   Show your ID card QR       │   │
│   └──────────────────────────────┘   │
│   ✅ Anil Patil (EMP-031)            │
│      CHECK-IN · Shift A · On time    │
└──────────────────────────────────────┘
```

- `POST /kiosk/punch` with header `x-device-token` (not the user JWT; the kiosk uses a separate small axios instance).
- Result banner for 3 s: green (on time), amber (late, shows minutes), blue (check-out with hours). Error: red "Card not recognised".
- Duplicate scan within 60 s shows "Already punched at 06:04".
- Offline: queue punches in memory with timestamps and retry every 10 s; show "Offline — 3 punches waiting".

---

## 13. Screen specs — Buyer, supplier, transport, driver

### 13.1 Buyer portal (`/buyer`)

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/buyer/orders` | `orders.view` | My orders across mills: Order · Mill · Fabric · Qty · Deadline · Stage · Progress · ETA · Risk | [Place order] |
| `/buyer/orders/new` | `orders.create` | Pick connected mill → mill catalog (`GET /partners/:orgId/catalog`) → lines, deadline, address | Submit |
| `/buyer/orders/:id` | `orders.view` | StageStepper, %, passed qty, ETA vs. deadline, timeline, dispatches with truck status, invoices. **No** machine / worker / cost data | Copy tracking link |
| `/buyer/deliveries` | `dispatch.view` | Incoming deliveries: dispatch, rolls, truck status, **delivery OTP** (shown to the buyer's receiving staff) | [Confirm received] [Report shortage / damage] |
| `/buyer/bills` | `invoice.view` | Bills from mills, status | Record payment (`payment.record`) |
| `/buyer/mills` | `partners.view` | Connected mills, connect by code | Connect |
| `/buyer/reports` | `reports.production` (buyer default role has it) | Spend per mill, on-time delivery %, rejects reported | — |

```
ORD-0142 · Twill Red · 1200 m · Deadline 18 Oct
●──────●──────●──────◐──────○──────○
Confirmed Material Production QC  Ready  Dispatched
Weaving 92% · 340 m passed QC · Expected ready 16 Oct 🟢
Dispatches: DSP-0079 (500 m) 🚚 In transit · OTP 4821
Invoices: INV-0213 ₹1.8 L · Paid
```

Live: `useWatchOrder(id)`; `order.status_changed`, `trip.status_changed` → refetch.

### 13.2 Supplier portal (`/supplier`)

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/supplier/pos` | `po.view` | Incoming POs: PO · Mill · Items · Qty · Need by · Status | Open |
| `/supplier/pos/:id` | `po.respond` | Lines; accept / partial qty / reject; promise date | Respond · [Create dispatch] |
| `/supplier/dispatches/new?po=` | `dispatch.create` | Lots per line (lot no., colour, qty), transporter, vehicle | Confirm dispatch |
| `/supplier/dispatches` | `dispatch.view` | Dispatches + truck status + mill GRN status | — |
| `/supplier/invoices` | `invoice.view` | Invoices to mills, status | [New invoice from dispatch] |
| `/supplier/customers` | `partners.view` | Connected mills | Connect |
| `/supplier/quality` | `po.view` | Feedback: lot → defects at the mill (e.g. "Lot L-221 → 12% holes") | — |

### 13.3 Transport portal (`/transport`)

| Route | Perm | Shows | Actions |
|---|---|---|---|
| `/transport/trips` | `transport.manage` | Tabs Requests / Active / Delivered; Trip · From → To · Rolls · Weight · Date · Status | Accept / Reject · Assign |
| `/transport/trips/:id` | `transport.manage` | TripStepper, pickup / drop, vehicle, driver, events, POD | Assign vehicle + driver · [Raise freight bill] |
| `/transport/fleet/vehicles` | `transport.manage` | Vehicles | CRUD |
| `/transport/fleet/drivers` | `transport.manage` | Drivers (+ invite driver login) | CRUD |
| `/transport/freight-bills` | `invoice.view` | Freight invoices, status | — |
| `/transport/customers` | `partners.view` | Connected mills / suppliers | Connect |
| Dashboard block | — | Active trips, today's deliveries, on-time %, freight earned | — |

### 13.4 Driver app (`/driver`)

```
┌─────────────────────────┐
│ TRIP TR-0045            │
│ Everest Mills → Surat   │
│ 17 rolls · 880 kg       │
│ GJ05 AB 1234            │
│ Status: In transit 🔵   │
│ [ REACHED DESTINATION ] │
│ Buyer OTP: [_ _ _ _]    │
│ [📸 Photo] [DELIVERED]  │
└─────────────────────────┘
```

- `/driver/trips`: my trips (today first).
- `/driver/trips/:id`: one big button for the next status only (Picked up → In transit → Reached → Delivered). Delivered needs the OTP + receiver name; photo optional.
- Wrong OTP shows attempts left.

---

## 14. Screen specs — Auth, onboarding, admin, public

### 14.1 Landing — `/`

Hero ("One platform for the textile supply chain"), four domain cards (Mill, Buyer, Supplier, Transporter), feature highlights (live machine board, roll traceability, scan-to-dispatch, cost per order, AI), [Get started] [Log in]. Dev-only **demo switcher** (when `VITE_ENABLE_DEMO_SWITCHER=true`): buttons that log in as each seeded demo user.

### 14.2 Auth

| Route | Notes |
|---|---|
| `/signup` | Name, email, password → Supabase `signUp` → "Check your email" screen |
| `/login` | Email + password → `/home` (→ `homeFor`) or `?next=` |
| `/forgot`, `/reset-password` | Supabase reset flow |
| `/auth/callback` | Handles the email-confirmation redirect, then `/home` |
| `/invite/staff/:token` | `GET /me/invites/staff/:token` (requires login; if not logged in, show org + role and buttons Log in / Sign up with `?next=`) → [Join Everest as Shift Supervisor] |
| `/invite/partner/:token` | Shows requester + relation → pick one of my orgs (or create one) → [Accept] |

### 14.3 Onboarding wizard — `/onboarding`

AntD `Steps`:
1. **Organization**: name, GSTIN, city, phone, type cards (Mill / Buyer / Supplier / Transporter — multi-select).
2. **Setup by type**:
   - Mill: stages (prefilled Spinning, Weaving, Dyeing; editable) + losses; shifts (A/B/C prefilled); quick-add machines (code, stage, capacity); starter items.
   - Transporter: vehicles, drivers.
   - Buyer / Supplier: delivery / dispatch address.
3. **Invite team** (optional): email + role rows.
4. **Done**: shows connect code with [Copy] and next steps → `homeFor()`.

Calls `POST /me/orgs` at step 4 with everything; shows a spinner and handles errors per step.

### 14.4 Platform admin — `/admin`

| Route | Shows | Actions |
|---|---|---|
| `/admin/orgs` | Name · Type · Users · Orders · City · Created · Status | Approve · Suspend · Reactivate |
| `/admin/orgs/:id` | Metadata, usage counts | — |
| `/admin/usage` | Orgs by type, new signups per week, active users | — |
| `/admin/announcements` | List + form | Publish |

### 14.5 Public tracking — `/track/:token`

Minimal mobile page: mill name, order no., StageStepper, status, ETA, timeline. No prices, no login, "Powered by Sameta" footer. `GET /public/track/:token`, refresh every 60 s.

---

## 15. QR scanning and printing

### 15.1 `components/qr/QrScanner.jsx`

```jsx
import { useEffect, useId, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QrScanner({ onScan, paused = false, height = 280 }) {
  const id = useId().replace(/:/g, '');
  const scannerRef = useRef(null);
  const lastRef = useRef({ code: null, at: 0 });

  useEffect(() => {
    const scanner = new Html5Qrcode(`qr-${id}`);
    scannerRef.current = scanner;
    scanner
      .start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (text) => {
        const now = Date.now();
        if (text === lastRef.current.code && now - lastRef.current.at < 2500) return;   // debounce repeats
        lastRef.current = { code: text, at: now };
        onScan(text);
      })
      .catch(() => { /* camera denied → parent shows manual entry */ });
    return () => { scanner.isScanning && scanner.stop().catch(() => {}); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = scannerRef.current;
    if (!s?.isScanning) return;
    paused ? s.pause(true) : s.resume();
  }, [paused]);

  return <div id={`qr-${id}`} style={{ width: '100%', minHeight: height }} />;
}
```

- Always show a **manual entry** input next to the scanner (camera denied, damaged label).
- Camera needs HTTPS (Vercel is HTTPS; `localhost` also works).

### 15.2 Labels

- `QrLabel` (`qrcode.react` → `QRCodeSVG`): roll label 60 × 40 mm with roll no., order, fabric, colour, length, date; worker badge 86 × 54 mm with photo, name, emp code.
- `QrLabelSheet`: grid of labels for batch printing (A4).
- `PrintButton` uses `react-to-print` with `@page { size: 60mm 40mm; margin: 0 }` for label printers, or A4 for sheets.
- Server PDFs exist too (`/rolls/:rollNo/label.pdf`, `/workers/:id/badge.pdf`) as a fallback.

---

## 16. Realtime UX

| Screen | Socket event | Reaction |
|---|---|---|
| Machine board, dashboard | `machine.updated`, `production.logged` | `invalidateQueries([orgId,'machines','board'])`; card flashes briefly |
| Order detail, buyer order | `order.status_changed` (after `order:watch`) | refetch order; toast "Status: Ready to ship" |
| QC queue | `qc.queue_changed` | refetch counts |
| Trips, buyer deliveries | `trip.status_changed` | refetch trip / dispatch |
| Attendance today, supervisor | `attendance.updated` | refetch today summary |
| Everywhere | `notification.new` | bell count +1, AntD `notification.open` for critical types |

- Connection indicator in the topbar (green dot / "Reconnecting…").
- Fallback: board and attendance-today also poll every 30 s (`refetchInterval`) in case the socket drops.

---

## 17. AI chat UI

### 17.1 Widget

- Floating 🤖 button bottom-right (only with `ai.chat`) → `ChatPanel` drawer (420 px desktop, full-screen on phone).
- Full page `/app/ai` with chat history list on the left.

```
You: which machine had the most defects last month?
🤖 W-3 had 41 defective rolls (18.2%), mostly colour mismatch.
   That's 4× the mill average; 62% of them used dye batch B7.
   [bar chart: defects by machine]
   ▸ View SQL
   [Defects by supplier] [W-3 downtime] [Cost of rework]
```

### 17.2 Behaviour

- `POST /ai/chat { chat_id?, question }` → `{ chat_id, answer, rows, chart, sql }`.
- `ChatMessage` renders answer text, then `ChartFromSpec` (bar / line / pie via Recharts; `table` → small AntD table; `kpi` → big number), then `SqlDisclosure` (collapsed code block).
- Suggestion chips per role (owner: Profit this month, Orders at risk, Defects by machine, Low stock, Absent today; supervisor: My machines today, Breakdowns this week; accounts: Overdue buyers, Wages this month).
- Pending state: typing indicator; disable input; cancel button.
- Errors: `AI_CANNOT_ANSWER` → friendly message + suggestions; `FORBIDDEN` → "You don't have access to that data".
- History: `GET /ai/chats`, `GET /ai/chats/:id`.

### 17.3 Insight cards

`InsightCard { severity, title, body, link }` on the dashboard: icon by severity, [View] link (e.g. to the machine report filtered on W-3), [Dismiss].

---

## 18. States, feedback, accessibility

- **Loading:** AntD `Skeleton` for cards and tables; spinners only for full-page waits.
- **Empty:** `EmptyState` with a next action ("No orders yet — [Create order]").
- **Error:** `ErrorState` with the API message and [Retry].
- **403:** permission page naming the missing permission in plain words ("You need access to Cost reports. Ask your owner.").
- **Success:** short toasts (`message.success`), never blocking dialogs.
- **Forms:** inline validation, required markers, sensible defaults (today's date, current shift).
- **Accessibility:** labels on every input, focus visible, colour + text for status, buttons with text (not icon-only) on floor screens, touch targets ≥ 48 px.
- **Language:** simple English; tooltips for terms (GSM, Ne, GRN).

---

## 19. Performance

- Lazy-load each portal and heavy pages (planning board, reports, AI) with `React.lazy`.
- Recharts and html5-qrcode load only on pages that use them.
- Server-side pagination and filtering for every list.
- `staleTime` 30 s globally; board and attendance use sockets + 30 s polling.
- Debounce search inputs (300 ms).
- Images (QC / POD photos) uploaded at max 1280 px width (resize in the browser before upload with a canvas).

---

## 20. Testing and QA

### 20.1 Automated (Vitest + Testing Library, keep it small)

| Test | Proves |
|---|---|
| `usePermission.test.js` | `can`, `inScope` with empty / filled scope |
| `homeFor.test.js` | Correct landing route per org type and role |
| `Can.test.jsx` | Hides children without permission |
| `StatusBadge.test.jsx` | Every status key renders a label |
| `textile.test.js` | m ↔ kg, yarn length, shirt example numbers |

### 20.2 Manual QA checklist (before every demo)

- [ ] Log in as each demo role → lands on the right screen; sidebar shows only allowed items
- [ ] Supervisor: no prices, no profit, only own machines
- [ ] Buyer: own orders only; no costs; live status updates when the operator logs production on another device
- [ ] Kiosk on a phone: scan badge → check-in banner; repeat scan → "already punched"
- [ ] Operator phone: start, add production, create roll (label prints), breakdown
- [ ] QC phone: scan, defects, photo, pass / rework / reject
- [ ] Dispatch: wrong order / not passed / duplicate show red rows; confirm creates invoice PDF
- [ ] Driver: status steps, wrong OTP, correct OTP → delivered; buyer sees it
- [ ] Reports: order cost, P&L, wastage load with seed data
- [ ] AI: 10 demo questions answered with charts
- [ ] Switch org → no data from the previous org visible
- [ ] Works at 360 px width (floor, kiosk, driver, buyer, public tracking)

---

## 21. Deployment

- **Vercel:** framework Vite, build `npm run build`, output `dist`, env from §2.4.
- SPA rewrites (`client/vercel.json`):

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

- Add the Vercel URL to Supabase Auth redirect URLs and to the backend `CLIENT_URL` (CORS + socket).
- Kiosk tablet: open `/kiosk` in Chrome, "Add to Home screen", keep the screen on.

---

## 22. Phase checklist

### Phase 0 — Setup
- [ ] Vite app, alias, Tailwind (preflight off), AntD theme, ESLint / Prettier
- [ ] `lib/` (supabase, api, queryClient, socket, status, format)
- [ ] Deployed to Vercel with SPA rewrite

### Phase 1 — Platform foundation
- [ ] AuthContext, OrgContext, SocketContext, `usePermission`, `<Can>`
- [ ] Guards + route tree skeleton for all portals (lazy)
- [ ] Landing, signup, login, forgot / reset, callback
- [ ] Onboarding wizard
- [ ] AppLayout, FloorLayout, PortalLayout, DriverLayout, KioskLayout, AdminLayout with nav configs
- [ ] OrgSwitcher, NotificationBell, UserMenu
- [ ] Settings: org, staff (invite, role, scope), roles editor, audit
- [ ] Invite accept pages (staff, partner); Partners page
- [ ] Admin orgs page
- [ ] Demo switcher (dev only)

### Phase 2 — Masters
- [ ] Items, BOM list + editor (with converter), material calculator
- [ ] Stages + losses, shifts, defect types, machines, workers + badge printing, kiosk devices

### Phase 3 — Orders, procurement, inventory
- [ ] Orders list / create / detail (overview, requirements, timeline)
- [ ] Stock page, GRN form (incl. pre-fill from dispatch), adjustments
- [ ] PO list / detail; supplier portal POs + dispatch; gate (office + floor)
- [ ] Buyer portal orders + place order; public tracking page

### Phase 4 — Attendance
- [ ] Kiosk (setup + punch + offline queue)
- [ ] Attendance today, register grid, requests; supervisor floor attendance tab

### Phase 5 — Production + maintenance
- [ ] Machine board (+ TV mode), planning board, work orders, assignments
- [ ] Operator floor screen, supervisor floor board, maintenance tickets (office + floor)
- [ ] Socket wiring for board / dashboard / order detail

### Phase 6 — QC + traceability
- [ ] QC station (floor) + QC dashboard (office) + override
- [ ] Roll trace page, roll labels

### Phase 7 — Dispatch + transport
- [ ] Dispatch list / new / scan (office + floor), PDFs
- [ ] Buyer deliveries (OTP, confirm, shortage)
- [ ] Transport portal (trips, fleet, freight) + driver app

### Phase 8 — Finance, wages, reports
- [ ] Invoices, bills, payments, expenses, receivables / payables (ageing)
- [ ] Wage runs + payslips
- [ ] Dashboard (role-aware), order cost, P&L, machines, wastage, QC, attendance reports + CSV export

### Phase 9 — Seed data check
- [ ] Every screen reviewed with the 90-day seed; fix empty / overflow layouts

### Phase 10 — AI
- [ ] Chat widget + full page, ChartFromSpec, SQL disclosure, suggestions per role
- [ ] Insight cards on dashboard

### Phase 11 — Polish + demo
- [ ] Loading / empty / error / 403 states everywhere
- [ ] Mobile QA at 360 px; kiosk on a real tablet; label printing test
- [ ] Manual QA checklist (§20.2) passes 3 times in a row
