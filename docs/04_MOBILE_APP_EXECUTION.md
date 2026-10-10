# TexLink — Mobile App Execution Plan

> One React Native app (Expo, JavaScript) for **buyers, suppliers, transporters, drivers, mill floor staff and mill owners (lite)**.
> It uses the same backend, Supabase Auth and database as the web app.
>
> Related docs:
> - [01_OVERALL_PLAN.md](01_OVERALL_PLAN.md) — product, domains, roles, workflows
> - [02_BACKEND_EXECUTION.md](02_BACKEND_EXECUTION.md) — API (§10) and the mobile additions (§5.13, §10.13)
> - [03_FRONTEND_EXECUTION.md](03_FRONTEND_EXECUTION.md) — web app (screens the mobile app mirrors)

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Technology stack](#2-technology-stack)
3. [Monorepo and code sharing](#3-monorepo-and-code-sharing)
4. [Architecture](#4-architecture)
5. [Project setup](#5-project-setup)
6. [Folder structure](#6-folder-structure)
7. [Core code](#7-core-code)
8. [Navigation and role-based experience](#8-navigation-and-role-based-experience)
9. [Screen specs by role](#9-screen-specs-by-role)
10. [Device features](#10-device-features)
11. [Offline support](#11-offline-support)
12. [Push notifications](#12-push-notifications)
13. [Realtime](#13-realtime)
14. [Design system](#14-design-system)
15. [Security](#15-security)
16. [Backend changes needed](#16-backend-changes-needed)
17. [Build, release, updates](#17-build-release-updates)
18. [Testing and QA](#18-testing-and-qa)
19. [Phase plan and checklist](#19-phase-plan-and-checklist)
20. [Demo moments](#20-demo-moments)
21. [Scope note](#21-scope-note)

---

## 1. Purpose and scope

**One app, one login. The screens change with your org type and role.**

| Who | Uses the app for | Stays on web |
|---|---|---|
| 🛒 Buyer | Place orders, live tracking, deliveries + OTP, bills, payments | Reports |
| 🧵 Supplier (seller) | Accept POs, dispatch lots, invoices, quality feedback | Bulk catalog edits |
| 🚚 Transporter owner / dispatcher | Trip requests, assign vehicle + driver, trip status, freight bills | Fleet reports |
| 🧑‍✈️ Driver | My trips, step-by-step status, OTP + photo proof of delivery | — |
| 🏭 Mill floor (operator, QC, supervisor, store, dispatch, maintenance, gate) | Scan, log production, QC, breakdowns, attendance grid, GRN, dispatch scan, gate | — |
| 👔 Mill owner / manager (lite) | KPIs, alerts, one-tap approvals, order status, AI chat | Planning board, BOM editor, settings, full reports |

**Rule:** the app is for **actions on the move** (scan, update, approve, track). Heavy office work stays on the web.

**Kiosk:** the main gate attendance kiosk stays on the web `/kiosk` page on a tablet. The app has an optional kiosk mode (§10.7).

---

## 2. Technology stack

| Area | Choice |
|---|---|
| Framework | **Expo (React Native), JavaScript** |
| Navigation | **Expo Router** (file-based, built on React Navigation) |
| Server data | **TanStack Query v5** + `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` |
| UI kit | **React Native Paper** (Material 3; icons via `@expo/vector-icons`) |
| Auth | `@supabase/supabase-js` with AsyncStorage session |
| HTTP | `axios` (shared API functions) |
| Realtime | `socket.io-client` |
| QR scanning | `expo-camera` (`CameraView` barcode scanning) |
| Photos | `expo-image-picker` + `expo-image-manipulator` |
| Push | `expo-notifications` + `expo-device` + Expo Push Service |
| Network state | `@react-native-community/netinfo` |
| Storage | `@react-native-async-storage/async-storage` (cache, queue, session), `expo-secure-store` (device token) |
| Files | `expo-file-system` + `expo-sharing` (PDFs) |
| Feedback | `expo-haptics` |
| Optional | `expo-local-authentication` (fingerprint), `expo-location` (last location on trip updates), `expo-keep-awake` (kiosk), `expo-screen-capture` (block screenshots on wage/P&L) |
| Validation | `zod` (shared schemas) |
| Dates | `dayjs` |
| Build | **EAS Build** (Android APK / AAB, iOS TestFlight), **EAS Update** for JS fixes |

---

## 3. Monorepo and code sharing

### 3.1 Layout

```
Odoo_Finale/
├─ package.json              # { "private": true, "workspaces": ["client", "mobile", "server", "packages/*"] }
├─ packages/
│  └─ shared/                # plain JS: no react-dom, no react-native imports
│     ├─ package.json        # { "name": "@texlink/shared", "main": "index.js" }
│     ├─ index.js
│     ├─ api/                # createApi(http) → { orders, trips, qc, dispatch, ... }
│     ├─ queryKeys.js
│     ├─ status.js           # status → { label, tone }  (tone: ok | warn | bad | info | muted)
│     ├─ format.js           # formatINR, formatQty, formatDate, formatTime, formatPct
│     ├─ permissions.js      # can(), inScope(), PERMS constants
│     ├─ portals.js          # experienceFor(org, role, permissions) (web uses homeFor on top of it)
│     ├─ textile.js          # m↔kg, yarn length, wastage helpers
│     └─ validation.js       # zod schemas for forms
├─ client/                   # React web (Vite)
├─ mobile/                   # React Native (Expo)  ← this doc
└─ server/
```

### 3.2 What is shared vs. platform-specific

| Shared (`@texlink/shared`) | Mobile-only |
|---|---|
| API endpoint functions, query keys, status labels/tones, formatters, permission helpers, experience routing, textile maths, zod schemas | Screens, navigation, camera, photos, push, offline queue, storage, file sharing, haptics |

### 3.3 Shared API pattern

```js
// packages/shared/api/index.js
export function createApi(http) {
  return {
    me: {
      orgs: () => http.get('/me/orgs').then((r) => r.data),
      context: (orgId) => http.get(`/me/orgs/${orgId}/context`).then((r) => r.data),
      registerPush: (body) => http.post('/me/push-tokens', body),
      removePush: (token) => http.delete(`/me/push-tokens/${encodeURIComponent(token)}`),
    },
    orders: {
      list: (params) => http.get('/orders', { params }),            // { data, meta }
      get: (id) => http.get(`/orders/${id}`).then((r) => r.data),
      create: (body) => http.post('/orders', body).then((r) => r.data),
      confirm: (id) => http.post(`/orders/${id}/confirm`).then((r) => r.data),
    },
    driver: {
      trips: () => http.get('/driver/trips').then((r) => r.data),
      setStatus: (id, body, opts) => http.post(`/driver/trips/${id}/status`, body, opts),
      deliver: (id, body) => http.post(`/driver/trips/${id}/deliver`, body).then((r) => r.data),
    },
    // trips, pos, dispatch, qc, rolls, production, attendance, receipts, invoices, payments, ai, notifications ...
  };
}
```

Web and mobile each create their own axios instance (different token storage) and call `createApi(http)`.

---

## 4. Architecture

```
┌───────────────────────────── TexLink Mobile (Expo) ─────────────────────────────┐
│ Expo Router: (auth) · select-org · (buyer) (supplier) (transport) (driver)      │
│              (floor) (owner) · deep links: invite/…, track/…                    │
│ Providers: Paper theme · PersistQueryClient · Auth · Org · Socket · Push        │
│ Offline mutation queue (AsyncStorage) + NetInfo online manager                  │
│ Device: expo-camera · image-picker · secure-store · file-system · haptics       │
└──────────────┬───────────────────────────────────────────┬──────────────────────┘
               │ HTTPS REST (Bearer JWT + x-org-id          │ WebSocket (foreground only)
               │  + Idempotency-Key for queued actions)     │
┌──────────────▼───────────────────────────────────────────▼──────────────────────┐
│ Same Node.js + Express backend (/api/v1) + Socket.io                             │
│ + push_tokens · idempotency_keys · /me/push-tokens · /app/version · push sender  │
└──────────────┬──────────────────────────────────────────────────┬────────────────┘
        Supabase (Postgres + RLS · Auth · Storage)          Expo Push Service → FCM / APNs
```

Tenancy and security don't change: every request carries the JWT and `x-org-id`, RLS isolates tenants, and `can()` checks permissions on the server.

---

## 5. Project setup

### 5.1 Create the app

```bash
# from repo root
npx create-expo-app@latest mobile --template blank
cd mobile

# navigation
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar

# device features
npx expo install expo-camera expo-image-picker expo-image-manipulator expo-notifications expo-device \
  expo-secure-store expo-file-system expo-sharing expo-haptics expo-keep-awake \
  expo-local-authentication expo-location expo-screen-capture \
  @react-native-async-storage/async-storage @react-native-community/netinfo react-native-url-polyfill

# data + UI
npm i @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-async-storage-persister \
  axios socket.io-client @supabase/supabase-js react-native-paper dayjs zod

# shared package
npm i @texlink/shared@*
```

Use `npx expo install` for Expo / native packages so versions match the Expo SDK.

### 5.2 `package.json`

```json
{
  "name": "texlink-mobile",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "lint": "eslint .",
    "build:apk": "eas build -p android --profile preview",
    "update": "eas update --branch preview"
  }
}
```

### 5.3 `app.config.js`

```js
export default {
  expo: {
    name: 'TexLink',
    slug: 'texlink',
    scheme: 'texlink',                       // deep links: texlink://...
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',          // light / dark from system
    splash: { image: './assets/splash.png', backgroundColor: '#3B5BDB' },
    ios: {
      bundleIdentifier: 'app.texlink.mobile',
      associatedDomains: ['applinks:texlink.app'],
      infoPlist: {
        NSCameraUsageDescription: 'Scan roll, worker and gate pass QR codes and take QC / delivery photos.',
        NSPhotoLibraryUsageDescription: 'Attach photos to QC and delivery records.',
        NSLocationWhenInUseUsageDescription: 'Attach your location to trip status updates.',
        NSFaceIDUsageDescription: 'Unlock TexLink with Face ID.',
      },
    },
    android: {
      package: 'app.texlink.mobile',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#3B5BDB' },
      permissions: ['CAMERA', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS', 'USE_BIOMETRIC'],
      intentFilters: [{
        action: 'VIEW', autoVerify: true,
        data: [{ scheme: 'https', host: 'texlink.app', pathPrefix: '/invite' },
               { scheme: 'https', host: 'texlink.app', pathPrefix: '/track' }],
        category: ['BROWSABLE', 'DEFAULT'],
      }],
    },
    plugins: [
      'expo-router',
      ['expo-camera', { cameraPermission: 'Scan QR codes and take photos.' }],
      'expo-notifications',
      'expo-secure-store',
      'expo-local-authentication',
    ],
    extra: { eas: { projectId: '<from eas init>' } },
  },
};
```

### 5.4 Environment (`mobile/.env`)

```bash
EXPO_PUBLIC_API_URL=https://api.texlink.app        # use your LAN IP (http://192.168.x.x:4000) for local dev on a phone
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_DEMO_SWITCHER=true
```

Only `EXPO_PUBLIC_*` values reach the app. Never put the service-role key or the Claude key here.

### 5.5 `metro.config.js` (monorepo)

Recent Expo SDKs detect npm workspaces automatically. Keep this file only if Metro can't resolve `@texlink/shared`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
module.exports = config;
```

### 5.6 `eas.json`

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" }, "channel": "preview" },
    "production": { "channel": "production" }
  }
}
```

---

## 6. Folder structure

```
mobile/
├─ app.config.js  eas.json  metro.config.js  package.json  .env
├─ assets/                      # icon, splash, adaptive icon, sounds
├─ app/                         # Expo Router routes
│  ├─ _layout.jsx               # all providers + notification tap handler
│  ├─ index.jsx                 # splash → login / onboarding / select-org / experience home
│  ├─ (auth)/
│  │  ├─ _layout.jsx  login.jsx  signup.jsx  forgot.jsx
│  ├─ onboarding.jsx            # simple create-org (name, type, city, GSTIN) — mills finish setup on web
│  ├─ select-org.jsx
│  ├─ notifications.jsx
│  ├─ invite/[kind]/[token].jsx # deep link: staff | partner
│  ├─ track/[token].jsx         # deep link: public tracking
│  ├─ roll/[rollNo].jsx         # roll trace (any mill role with qc.view)
│  ├─ (buyer)/
│  │  ├─ _layout.jsx            # Tabs: Orders · Deliveries · Bills · More
│  │  ├─ orders/index.jsx  orders/new.jsx  orders/[id].jsx
│  │  ├─ deliveries/index.jsx  deliveries/[id].jsx
│  │  ├─ bills/index.jsx  bills/[id].jsx
│  │  └─ more.jsx
│  ├─ (supplier)/
│  │  ├─ _layout.jsx            # Tabs: POs · Dispatches · Invoices · More
│  │  ├─ pos/index.jsx  pos/[id].jsx
│  │  ├─ dispatches/index.jsx  dispatches/new.jsx  dispatches/[id].jsx
│  │  ├─ invoices/index.jsx
│  │  └─ more.jsx               # quality feedback, customers
│  ├─ (transport)/
│  │  ├─ _layout.jsx            # Tabs: Requests · Active · Fleet · More
│  │  ├─ requests.jsx  active.jsx  trips/[id].jsx
│  │  ├─ fleet/index.jsx  fleet/vehicle.jsx  fleet/driver.jsx
│  │  └─ more.jsx               # freight bills, customers
│  ├─ (driver)/
│  │  ├─ _layout.jsx            # Tabs: My trips · Profile
│  │  ├─ trips/index.jsx  trips/[id].jsx
│  │  └─ profile.jsx
│  ├─ (floor)/
│  │  ├─ _layout.jsx            # Tabs filtered by permission
│  │  ├─ machine.jsx            # operator
│  │  ├─ qc.jsx                 # QC station
│  │  ├─ area/index.jsx  area/attendance.jsx  area/assign.jsx    # supervisor
│  │  ├─ store/index.jsx  store/receive/[id].jsx                 # store keeper
│  │  ├─ dispatch/index.jsx  dispatch/[id].jsx                   # dispatch in-charge
│  │  ├─ maintenance.jsx  gate.jsx
│  │  └─ more.jsx
│  └─ (owner)/
│     ├─ _layout.jsx            # Tabs: Home · Orders · Alerts · Ask AI · More
│     ├─ home.jsx  orders/index.jsx  orders/[id].jsx
│     ├─ alerts.jsx  ai.jsx  more.jsx  board.jsx  attendance.jsx  kiosk.jsx
└─ src/
   ├─ lib/       supabase.js  http.js  api.js  queryClient.js  socket.js  push.js
   │             offlineQueue.js  uploads.js  files.js  storage.js
   ├─ context/   AuthContext.jsx  OrgContext.jsx  SocketContext.jsx
   ├─ hooks/     usePermission.js  useSocketEvent.js  useOnline.js  useQueuedMutation.js
   ├─ components/
   │  ├─ ScreenHeader  OrgSwitcherSheet  OfflineBanner  StatusChip  KpiTile  BigButton
   │  ├─ QrScanSheet  PhotoPicker  NumberPad  OtpInput  StageStepper  TripStepper
   │  ├─ ListItemCard  EmptyView  ErrorView  LoadingView  ChartBars  ConfirmDialog
   │  └─ DefectCounter  MachineTile  RollResultFlash
   └─ theme.js
```

---

## 7. Core code

### 7.1 `src/lib/supabase.js`

```js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
);

// refresh the session only while the app is in the foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

### 7.2 `src/lib/http.js` and `src/lib/api.js`

```js
// http.js
import axios from 'axios';
import { supabase } from './supabase';

let currentOrgId = null;
export const setHttpOrg = (id) => { currentOrgId = id; };

export const http = axios.create({ baseURL: `${process.env.EXPO_PUBLIC_API_URL}/api/v1`, timeout: 20000 });

http.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (currentOrgId && !config.headers['x-org-id']) config.headers['x-org-id'] = currentOrgId;
  config.headers['x-client'] = 'mobile';
  return config;
});

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

http.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const status = err.response?.status ?? 0;
    const e = err.response?.data?.error ?? {};
    if (status === 401) await supabase.auth.signOut();
    return Promise.reject(new ApiError(status, e.code ?? (status ? 'HTTP' : 'NETWORK'), e.message ?? 'No connection', e.details));
  },
);
```

```js
// api.js
import { createApi } from '@texlink/shared';
import { http } from './http';
export const api = createApi(http);
```

### 7.3 `src/lib/queryClient.js` (offline-aware)

```js
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)));

AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,            // keep cache 24 h so offline reads work
      retry: (n, err) => (err?.status ?? 500) >= 500 && n < 2,
      networkMode: 'offlineFirst',
    },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'texlink.cache' });
```

### 7.4 `app/_layout.jsx`

```jsx
import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { useColorScheme } from 'react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { queryClient, persister } from '@/lib/queryClient';
import { AuthProvider } from '@/context/AuthContext';
import { OrgProvider } from '@/context/OrgContext';
import { SocketProvider } from '@/context/SocketContext';
import { OfflineQueueRunner } from '@/lib/offlineQueue';
import { lightTheme, darkTheme } from '@/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export default function RootLayout() {
  const scheme = useColorScheme();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = res.notification.request.content.data?.url;
      if (url) router.push(url);                     // e.g. "/(driver)/trips/123"
    });
    return () => sub.remove();
  }, []);

  return (
    <PaperProvider theme={scheme === 'dark' ? darkTheme : lightTheme}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}>
        <AuthProvider>
          <OrgProvider>
            <SocketProvider>
              <OfflineQueueRunner />
              <Stack screenOptions={{ headerShown: false }} />
            </SocketProvider>
          </OrgProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </PaperProvider>
  );
}
```

> Path alias `@/` → `src/`: add `babel-plugin-module-resolver` or the `"paths"` field in `jsconfig.json` (Expo supports `jsconfig.json` paths).

### 7.5 `OrgContext` (mobile)

Same contract as the web `OrgContext` (orgs, orgId, org, role, permissions, scope, switchOrg). Differences:
- Selected org id saved in AsyncStorage (`texlink.orgId`).
- `switchOrg(id)`: `queryClient.clear()`, `setHttpOrg(id)`, re-register the push token for the new org, reconnect the socket.
- On logout: remove the push token, clear cache and persisted cache, warn if the offline queue isn't empty.

### 7.6 `app/index.jsx` (decide where to go)

```jsx
import { Redirect } from 'expo-router';
import { experienceFor } from '@texlink/shared';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import LoadingView from '@/components/LoadingView';

const HOME = {
  driver: '/(driver)/trips', transport: '/(transport)/requests', supplier: '/(supplier)/pos',
  buyer: '/(buyer)/orders', owner: '/(owner)/home',
  floor_operator: '/(floor)/machine', floor_qc: '/(floor)/qc', floor_supervisor: '/(floor)/area',
  floor_store: '/(floor)/store', floor_dispatch: '/(floor)/dispatch',
  floor_maintenance: '/(floor)/maintenance', floor_gate: '/(floor)/gate',
};

export default function Index() {
  const { user, loading } = useAuth();
  const { orgs, org, role, permissions, loading: orgLoading } = useOrg();
  if (loading || (user && orgLoading)) return <LoadingView />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (orgs.length === 0) return <Redirect href="/onboarding" />;
  if (!org) return <Redirect href="/select-org" />;
  return <Redirect href={HOME[experienceFor(org, role, permissions)] ?? '/(owner)/home'} />;
}
```

`experienceFor` (shared):

```js
export function experienceFor(org, role, permissions) {
  const t = org.types;
  const has = (p) => permissions.has(p);
  if (t.includes('transporter')) return has('trip.drive') && !has('transport.manage') ? 'driver' : 'transport';
  if (t.includes('manufacturer')) {
    if (has('reports.pnl') || has('orders.confirm') || (role?.rank ?? 0) >= 80) return 'owner';
    if (has('production.log') && !has('production.plan')) return 'floor_operator';
    if (has('qc.inspect')) return 'floor_qc';
    if (has('assignment.manage')) return 'floor_supervisor';
    if (has('receipt.create')) return 'floor_store';
    if (has('dispatch.create')) return 'floor_dispatch';
    if (has('maintenance.fix')) return 'floor_maintenance';
    if (has('gate.log')) return 'floor_gate';
    return 'owner';
  }
  if (t.includes('supplier')) return 'supplier';
  if (t.includes('buyer')) return 'buyer';
  return 'owner';
}
```

An org with several types (e.g. manufacturer + supplier) shows a "Switch view" item in More.

---

## 8. Navigation and role-based experience

### 8.1 Flow after login

```
Open app
  → no session → (auth)/login
  → session → GET /me/orgs
      → 0 orgs → onboarding (create org) or "Join with invite link"
      → 1 org → auto-select · many → select-org (remembered)
  → GET /me/orgs/:id/context (types, role, permissions, scope)
  → experienceFor() → tab group
  → register push token for this org · connect socket
```

### 8.2 Tabs per experience

| Experience | Tabs |
|---|---|
| Buyer | Orders · Deliveries · Bills · More |
| Supplier | POs · Dispatches · Invoices · More |
| Transporter | Requests · Active · Fleet · More |
| Driver | My trips · Profile |
| Floor | Machine · QC · Area · Store · Dispatch · Fix · Gate · More — **only tabs the user has permission for** (usually 2–4) |
| Owner / manager | Home · Orders · Alerts · Ask AI · More |

### 8.3 Hiding tabs by permission (Expo Router)

```jsx
// app/(floor)/_layout.jsx
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePermission } from '@/hooks/usePermission';

const icon = (name) => ({ color, size }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

export default function FloorTabs() {
  const { can } = usePermission();
  const show = (...p) => (can(...p) ? undefined : null);      // href: null hides the tab
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarLabelStyle: { fontSize: 13 } }}>
      <Tabs.Screen name="machine" options={{ title: 'Machine', href: show('production.log'), tabBarIcon: icon('cog') }} />
      <Tabs.Screen name="qc" options={{ title: 'QC', href: show('qc.inspect'), tabBarIcon: icon('check-decagram') }} />
      <Tabs.Screen name="area" options={{ title: 'Area', href: show('assignment.manage'), tabBarIcon: icon('account-group') }} />
      <Tabs.Screen name="store" options={{ title: 'Store', href: show('receipt.create'), tabBarIcon: icon('package-variant') }} />
      <Tabs.Screen name="dispatch" options={{ title: 'Dispatch', href: show('dispatch.create'), tabBarIcon: icon('truck-delivery') }} />
      <Tabs.Screen name="maintenance" options={{ title: 'Fix', href: show('maintenance.fix'), tabBarIcon: icon('wrench') }} />
      <Tabs.Screen name="gate" options={{ title: 'Gate', href: show('gate.log'), tabBarIcon: icon('boom-gate') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('dots-horizontal') }} />
    </Tabs>
  );
}
```

Each tab-group `_layout.jsx` also guards the experience: if the org type doesn't match (e.g. a deep link into `(buyer)` while a mill org is selected), it redirects to `/`.

### 8.4 Common header

`ScreenHeader`: title, org avatar (opens `OrgSwitcherSheet`), notification bell with badge, connection dot (online / offline / queued count).

### 8.5 Deep links

| Link | Opens |
|---|---|
| `https://texlink.app/invite/staff/<token>` | `invite/staff/[token]` → accept → home |
| `https://texlink.app/invite/partner/<token>` | `invite/partner/[token]` → pick org → accept |
| `https://texlink.app/track/<token>` | `track/[token]` (no login needed) |
| `texlink://(buyer)/orders/<id>` etc. | Push notification targets |

---

## 9. Screen specs by role

Format: what it shows · actions · API (from backend doc §10).

### 9.1 🛒 Buyer

| Screen | Shows | Actions | API |
|---|---|---|---|
| Orders | Cards: order no., mill, fabric, qty, stage, progress bar, ETA, risk chip; filter chips Active / Ready / Delivered | + New order; pull to refresh | `GET /orders?side=purchase` |
| New order | Pick mill → mill catalog (fabric, colour, GSM, width) → qty, deadline, address | Submit | `GET /partners/:orgId/catalog`, `POST /orders` |
| Order detail | Stage stepper, %, passed qty, ETA vs. deadline, timeline, dispatches with truck status, invoices | Share tracking link | `GET /orders/:id`, socket `order:watch` |
| Deliveries | Incoming dispatches: rolls, truck status, **OTP in large digits** | Confirm received · Report shortage / damage (photo, note) | `GET /dispatches?side=incoming`, `POST /dispatches/:id/receive` |
| Bills | Invoices from mills: no., due date, total, status | Record payment (amount, mode, ref) · Open PDF | `GET /invoices?side=purchase`, `POST /payments`, `GET /invoices/:id/pdf` |
| More | Connected mills, connect by code, Ask AI (own orders), profile, switch org | — | `GET /partners`, `POST /partners/connect-code` |

```
┌────────────────────────────┐
│ ORD-0142 · Everest Mills   │
│ Twill Red · 1,200 m        │
│ ●───●───●───◐───○───○      │
│ Weaving 92% · QC 340 m ✅  │
│ ETA 16 Oct · Deadline 18 🟢│
│ 🚚 DSP-0079 In transit     │
│    Delivery OTP: 4 8 2 1   │
│ 🧾 INV-0213 ₹1.8 L · Paid  │
└────────────────────────────┘
```

### 9.2 🧵 Supplier

| Screen | Shows | Actions | API |
|---|---|---|---|
| POs | Mill, items, qty, need-by, status | Open | `GET /purchase-orders?side=sales` |
| PO detail | Lines with qty | Accept · Partial (qty per line) · Reject · Promise date | `POST /purchase-orders/:id/respond` |
| New dispatch | Per line: lot no., colour, qty; transporter (connected) or own vehicle + driver | Confirm dispatch | `POST /purchase-orders/:id/dispatch` |
| Dispatches | Status, truck, mill GRN result (received / shortage) | — | `GET /dispatches?side=outgoing` |
| Invoices | Invoices to mills, payment status | Create from dispatch · Open PDF | `GET /invoices?side=sales`, `POST /invoices/from-dispatch/:id` |
| Quality feedback | "Lot L-221 → 12% holes at Everest" | — | `GET /supplier/quality-feedback` |

### 9.3 🚚 Transporter (owner / dispatcher)

| Screen | Shows | Actions | API |
|---|---|---|---|
| Requests | From → to, rolls, weight, date, customer | Accept · Reject | `GET /transport/trips?status=requested`, `POST .../accept|reject` |
| Active | Trips with stepper, driver, vehicle, last update time | Open | `GET /transport/trips?status=active` |
| Trip detail | Timeline, pickup / drop, POD photo, receiver name | Assign vehicle + driver · Raise freight bill | `POST .../assign`, `POST .../freight-invoice` |
| Fleet | Vehicles, drivers | Add / edit · Invite driver (phone / email) | `/transport/vehicles`, `/transport/drivers` |
| More | Freight bills, customers, on-time % | — | `GET /invoices?kind=freight` |

### 9.4 🧑‍✈️ Driver

| Screen | Shows | Actions |
|---|---|---|
| My trips | Today first: trip no., route, rolls, weight, status | Open |
| Trip | Route, rolls, weight, vehicle; 📞 pickup and 📞 receiver buttons (`tel:` links); 🗺 open address in the maps app (`geo:` / maps URL) | **One big button for the next step only**: Picked up → In transit → Reached → Delivered |
| Deliver | OTP input (4 boxes), receiver name, photo | Delivered (needs internet; shows attempts left on a wrong OTP) |

```
┌─────────────────────────┐
│ TRIP TR-0045            │
│ Everest Mills → Surat   │
│ 17 rolls · 880 kg       │
│ GJ05 AB 1234            │
│ 📞 Pickup   📞 Receiver │
│ 🗺 Open in Maps         │
│ Status: In transit 🔵   │
│ ┌─────────────────────┐ │
│ │ REACHED DESTINATION │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Status steps are **queued offline** with the time they happened (§11). The final delivery (OTP check) needs a connection.

### 9.5 🏭 Mill floor

| Role / tab | Shows | Actions | API |
|---|---|---|---|
| **Machine** (operator) | Machine, shift, order, fabric, target vs. done bar | + Add production (NumberPad) · Create roll (length, weight, dye batch → QR shown + print request) · Pause / Resume · Breakdown (reason grid) · Start · Finish (good qty, weight, waste qty + type) | `/production/board?mine=true`, `/work-orders/:id/*`, `POST /rolls`, `POST /machines/:id/breakdown` |
| **QC** | Scanner; roll info (order, machine, dye batch); defect counters; photo; queue count | Pass · Rework · Reject → full-screen colour flash → back to scanning | `GET /rolls/:code`, `POST /qc/inspections` |
| **Area** (supervisor) | Present / absent / late for my area; unmanned machines; machine list; open breakdowns | Reassign worker · Attendance grid (mark all present → exceptions) · Close breakdown | `/attendance/today`, `POST /assignments`, `POST /attendance/bulk`, `/maintenance/tickets` |
| **Store** | Expected supplier dispatches; stock lookup by scan / search | Open pre-filled GRN → edit received qty → Post | `GET /gate/expected`, `POST /receipts`, `POST /receipts/:id/post`, `GET /stock` |
| **Dispatch** | Ready orders; dispatch scan screen with ✅ / ❌ rows and reasons; ordered / scanned / remaining | Scan · Remove · Confirm (if `dispatch.confirm`) | `/dispatches/*` |
| **Fix** (maintenance) | My tickets: machine, reason, since | Start · Resolve (notes, parts) | `/maintenance/tickets/*` |
| **Gate** | Today's register | Vehicle IN / OUT → vehicle no. (type or scan gate pass) → match expected dispatch → save | `/gate/entries`, `/gate/expected` |
| Any (scan a roll) | Roll trace timeline | — | `GET /rolls/:rollNo/trace` |

Operator screen:

```
┌─────────────────────────┐
│ W-3 · Shift A · Anil    │
│ ORD-0142  Twill Red     │
│ ▓▓▓▓▓▓▓▓░░  920 / 1200 m│
│ [   + ADD PRODUCTION  ] │
│ [   CREATE ROLL 🏷     ] │
│ [ PAUSE ] [ BREAKDOWN ] │
└─────────────────────────┘
```

QC station:

```
┌─────────────────────────┐
│ [ camera · scan roll ]  │
│ R-0142-017 · 52 m       │
│ ORD-0142 · W-3 · Dye B7 │
│ Hole      [-] 1 [+]     │
│ Colour    [-] 0 [+]     │
│ Uneven    [-] 0 [+]     │
│ [📸 Photo]              │
│ [PASS] [REWORK] [REJECT]│
└─────────────────────────┘
```

**Roll labels from the phone:** the operator's "Create roll" shows the QR on screen and sends a print request to the office print queue (`POST /rolls/:id/print` → shown on the web dispatch/store screen as "Labels to print"). Direct Bluetooth printing is out of scope.

### 9.6 👔 Owner / manager (lite)

| Screen | Shows | Actions | API |
|---|---|---|---|
| Home | KPI tiles: today's output, running / idle / down, orders at risk, present today, profit this month 🔒, overdue receivables 🔒; AI insight cards | Tap a tile → detail | `GET /reports/dashboard`, `GET /ai/insights` |
| Orders | Same list as web (read-mostly) | Confirm order | `/orders` |
| Alerts | Notifications + **approvals**: OT, leave, attendance corrections, stock adjustments, wage run, partner requests | Approve / Reject in one tap | `/notifications`, approval endpoints |
| Ask AI | Chat: answer, small chart, "View SQL", suggestion chips | Ask | `POST /ai/chat` |
| More | Machine board (read-only grid), attendance today, P&L summary card 🔒, kiosk mode, switch org, profile | — | `/production/board`, `/attendance/today`, `/reports/pnl` |

### 9.7 Shared screens

| Screen | Notes |
|---|---|
| Login / signup / forgot | Supabase auth; demo switcher in dev builds |
| Onboarding | Name, type, city, GSTIN → `POST /me/orgs`; mills are told to finish setup (stages, machines, BOM) on the web |
| Select org | List with type chips |
| Notifications | List, mark read, tap → `link` |
| Invite accept | Staff / partner |
| Public tracking | Stepper + status + ETA |
| Profile | Name, phone, fingerprint unlock toggle, sign out, app version |

---

## 10. Device features

### 10.1 QR scanning (`src/components/QrScanSheet.jsx`)

```jsx
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Button, Text, TextInput } from 'react-native-paper';

export default function QrScanSheet({ onScan, active = true }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const last = useRef({ code: null, at: 0 });

  if (!permission) return null;
  if (!permission.granted) {
    return <Button mode="contained" onPress={requestPermission}>Allow camera to scan</Button>;
  }

  const handle = (code) => {
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 2500) return;   // ignore repeats
    last.current = { code, at: now };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onScan(code);
  };

  return (
    <View style={{ gap: 12 }}>
      {active && (
        <CameraView
          style={{ height: 300, borderRadius: 12, overflow: 'hidden' }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handle(data)}
        />
      )}
      <Text variant="labelMedium">Label damaged? Type the code:</Text>
      <TextInput mode="outlined" value={manual} onChangeText={setManual} placeholder="R-0142-017"
                 autoCapitalize="characters" onSubmitEditing={() => manual && handle(manual.trim())} />
    </View>
  );
}
```

- Error results use `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)`.
- Pass `active={isFocused}` (from `useIsFocused`) so the camera turns off when leaving the screen.

### 10.2 Photos (`src/lib/uploads.js`)

```js
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { http } from './http';

export async function takeAndUploadPhoto(bucket) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
  if (shot.canceled) return null;

  const small = await ImageManipulator.manipulateAsync(
    shot.assets[0].uri, [{ resize: { width: 1280 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });

  const { data } = await http.post('/uploads/sign', { bucket, filename: 'photo.jpg' });   // { path, signed_url }
  const blob = await (await fetch(small.uri)).blob();
  await fetch(data.signed_url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  return data.path;
}
```

### 10.3 PDFs (`src/lib/files.js`)

Download with `expo-file-system` (`File` / `downloadAsync` per the installed SDK's API) using the auth header, then `Sharing.shareAsync(uri)` to open or forward the invoice, packing list or payslip.

### 10.4 Calls and maps (driver)

`Linking.openURL('tel:+91…')` and `Linking.openURL(Platform.select({ ios: 'maps:?q=' + addr, android: 'geo:0,0?q=' + addr }))`.

### 10.5 Location (optional)

On each trip status update, attach `{ lat, lng }` from `Location.getLastKnownPositionAsync()` if permission is granted. No background tracking.

### 10.6 Fingerprint unlock (optional)

On app open (if enabled in Profile): `LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock TexLink' })`. On failure, show the login screen.

### 10.7 Kiosk mode (optional)

Owner → More → Kiosk mode → scan the device setup QR from web Settings → Kiosk → token saved in `expo-secure-store` → full-screen scanner calling `POST /kiosk/punch` with `x-device-token`, `expo-keep-awake` on, exit with the owner's PIN. Result banner like the web kiosk (green on time / amber late / blue check-out / red unknown).

---

## 11. Offline support

### 11.1 What works offline

| Works offline | Needs internet |
|---|---|
| Reading cached lists and details (trips, orders, today's work, queue counts) | Dispatch confirm, OTP delivery, payments, PO respond, login |
| **Queued:** production logs, roll creation, QC results, breakdown reports, trip status steps, GRN post, supervisor attendance grid, gate entries | AI chat |

### 11.2 Queue design (`src/lib/offlineQueue.js`)

```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { http } from './http';
import { queryClient } from './queryClient';

const KEY = 'texlink.queue';
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function readQueue() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { return []; }
}
async function writeQueue(items) { await AsyncStorage.setItem(KEY, JSON.stringify(items)); }

// add an action; body gets client_time so the server keeps the real time
export async function enqueue({ method, path, body, orgId, label, invalidate = [] }) {
  const item = { id: uuid(), method, path, orgId, label, invalidate,
                 body: { ...body, client_time: new Date().toISOString() }, status: 'pending', error: null };
  await writeQueue([...(await readQueue()), item]);
  flush();                                    // try right away
  return item;
}

let flushing = false;
export async function flush() {
  if (flushing) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;
  flushing = true;
  try {
    let items = await readQueue();
    for (const item of items.filter((i) => i.status === 'pending')) {
      try {
        await http.request({
          method: item.method, url: item.path, data: item.body,
          headers: { 'x-org-id': item.orgId, 'Idempotency-Key': item.id },
        });
        items = items.filter((i) => i.id !== item.id);
        item.invalidate.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      } catch (err) {
        if (err.status === 0 || err.status >= 500) break;                // still offline / server down → retry later
        items = items.map((i) => (i.id === item.id ? { ...i, status: 'failed', error: err.message } : i));
      }
      await writeQueue(items);
    }
  } finally {
    flushing = false;
  }
}

export function OfflineQueueRunner() {
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
    const timer = setInterval(flush, 15000);
    return () => { unsub(); clearInterval(timer); };
  }, []);
  return null;
}
```

- Items keep their **org id**, so switching org doesn't send an action to the wrong tenant.
- Items are sent **in order** (a production log must arrive before its roll).
- **Failed** items (business errors such as "machine is in breakdown") stay in the queue with the reason. "Pending actions" in More lists them: Retry · Discard.
- `OfflineBanner` shows "Offline — 3 actions waiting" or "2 actions failed — tap to review".
- `useQueuedMutation(config)` wraps `enqueue` + an optimistic cache update, so screens use it like a normal mutation.

---

## 12. Push notifications

### 12.1 Register (`src/lib/push.js`)

```js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

export async function registerPush(orgId) {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'TexLink', importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const { status } = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.me.registerPush({ token, org_id: orgId, platform: Platform.OS, device_name: Device.deviceName });
  return token;
}
```

Call after org selection and on every org switch. On logout call `api.me.removePush(token)`.

### 12.2 Push catalog

| Event | Recipients | Opens |
|---|---|---|
| Order placed by buyer | Mill: `orders.confirm` | Owner order detail |
| Order ready to ship / dispatched / delivered | Buyer org members with `orders.view` | Buyer order detail |
| Delivery OTP | Buyer: `receipt.create` | Buyer delivery |
| PO sent | Supplier: `po.respond` | Supplier PO |
| PO responded / supplier dispatched | Mill: `po.create`, `receipt.create` | Store / owner |
| Trip request | Transporter: `transport.manage` | Requests |
| Trip assigned | The driver | Driver trip |
| Trip status changed | Mill `dispatch.view` + buyer | Dispatch / delivery |
| Breakdown | Supervisor of that area + `maintenance.fix` | Area / Fix |
| Absent alert | Supervisor of that area | Area |
| Approvals waiting (OT, leave, adjustment, wage run) | Approvers | Owner alerts |
| Low stock | `stock.view` (store, owner) | Store / owner |
| Overdue payment | `invoice.view` | Owner alerts |
| Partner request | `partners.approve` | Owner alerts / More |

Payload: `{ title, body, data: { url, type, id } }`. Never put prices or wages in push text (lock screens are visible).

---

## 13. Realtime

- `SocketProvider` connects only while the app is **active** (AppState) and the user has an org; it disconnects in the background (push covers that).
- Same events as web: `machine.updated`, `production.logged`, `order.status_changed` (after `order:watch`), `qc.queue_changed`, `trip.status_changed`, `attendance.updated`, `notification.new`.
- Handlers only call `queryClient.invalidateQueries(...)`; data always comes from the API.
- Screens that show live data also refetch when they regain focus (`useFocusEffect`).

---

## 14. Design system

### 14.1 Theme (`src/theme.js`)

```js
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

const brand = { primary: '#3B5BDB', ok: '#2F9E44', warn: '#F08C00', bad: '#E03131', info: '#1C7ED6', muted: '#868E96' };

export const lightTheme = { ...MD3LightTheme, roundness: 3,
  colors: { ...MD3LightTheme.colors, primary: brand.primary, error: brand.bad, ...brand } };
export const darkTheme = { ...MD3DarkTheme, roundness: 3,
  colors: { ...MD3DarkTheme.colors, primary: '#748FFC', error: '#FF6B6B',
            ok: '#51CF66', warn: '#FFA94D', bad: '#FF6B6B', info: '#4DABF7', muted: '#ADB5BD' } };
```

`StatusChip` maps the shared `status.js` tone (`ok | warn | bad | info | muted`) to these colours, so labels and meanings match the web.

### 14.2 Rules

- Floor, driver and kiosk: buttons ≥ 56 px tall, text ≥ 16 px, key numbers 28–32 px, one main action per screen, usable with gloves.
- Lists are cards, never wide tables. Pull to refresh everywhere. Infinite scroll with server pagination.
- Every screen has loading, empty, error and offline states.
- Colour always comes with a text label or icon.
- Respect safe areas (notches) with `react-native-safe-area-context`.
- Text lives in one strings file (`src/strings.js`) so Hindi / Gujarati can be added later with `i18next`. English only for the hackathon.

---

## 15. Security

| Rule | How |
|---|---|
| Same tenant isolation | JWT + `x-org-id` on every request; server RLS and `can()` decide |
| No secrets in the app | Only the Supabase anon key and API URL (`EXPO_PUBLIC_*`) |
| Confidential data | Server strips prices / costs / wages; the app also hides 🔒 tiles with `usePermission` |
| Push content | No amounts or wages in notification text |
| Logout | Remove push token, clear cache + persisted cache, warn about non-empty offline queue, sign out |
| Lost phone | Owner disables the membership on the web → next call returns 403 → app logs out |
| Device token (kiosk mode) | `expo-secure-store` only |
| Screenshots | Optional `expo-screen-capture` block on wage and P&L screens |
| Old versions | `GET /app/version` on start; below `min_version` → "Please update" screen |
| Idempotency | Queued actions carry `Idempotency-Key`, so retries never double-post |

---

## 16. Backend changes needed

Also added to [02_BACKEND_EXECUTION.md](02_BACKEND_EXECUTION.md) §5.13 and §10.13.

| Change | Detail |
|---|---|
| Migration `018_mobile.sql` | `push_tokens`, `idempotency_keys` tables with RLS |
| `POST /me/push-tokens`, `DELETE /me/push-tokens/:token` | Register / remove device tokens per org |
| Push sender | Notifier also sends to Expo Push API for the target users; removes tokens that come back `DeviceNotRegistered` |
| `Idempotency-Key` middleware | For POST / PATCH: if `(org_id, key)` exists, return the stored response; else run and store (24 h) |
| `client_time` | Accepted on production logs, rolls, QC, breakdowns, trip status, punches, gate entries, GRN post; used if within the last 24 h |
| `GET /app/version` | `{ min_version, latest_version }` (public) |
| `GET /production/board?mine=true` | Operator's assigned machine(s) for the current shift |
| `GET /supplier/quality-feedback` | Defect stats for the supplier's lots at each mill (via security-definer summary, no mill internals) |
| `POST /rolls/:id/print` + `GET /print-queue` | Phone-created rolls queue labels for printing at the office |
| Universal links | Host `/.well-known/assetlinks.json` (Android) and `/.well-known/apple-app-site-association` (iOS) on the web domain |

---

## 17. Build, release, updates

| Step | Command / action |
|---|---|
| Expo account + project | `npx expo login`, `eas init` (writes `projectId`) |
| Dev on a phone | `npx expo start` → scan with **Expo Go** (camera works; push needs a dev build) |
| Dev build (push testing) | `eas build -p android --profile development` → install → `npx expo start --dev-client` |
| Android push | Add FCM credentials: `eas credentials` |
| Demo APK | `eas build -p android --profile preview` → share the install link / QR with the team and judges |
| JS-only fixes during the hackathon | `eas update --branch preview -m "fix dispatch scan"` |
| iOS (optional) | Apple developer account → `eas build -p ios` → TestFlight |

Version rule: bump `version` in `app.config.js` for native changes; JS fixes go through EAS Update.

---

## 18. Testing and QA

### 18.1 Automated (small)

- Shared package tests (already run on web): `experienceFor`, `can`, `inScope`, formatters, textile maths.
- Mobile: `offlineQueue` unit tests with mocked AsyncStorage / NetInfo / http (order kept, failed items kept, idempotency key reused on retry).

### 18.2 Manual checklist (real Android phones)

- [ ] Each demo role lands on its own tabs; hidden tabs really hidden
- [ ] Org switch: no data from the previous org; push re-registered
- [ ] Buyer: live order update while an operator logs on another phone; OTP visible; push on "Ready to ship"
- [ ] Driver: airplane mode → status step shows "Queued" → back online → mill web updates; wrong OTP → attempts left; correct OTP → delivered everywhere
- [ ] Transporter: accept request → assign driver → driver gets push
- [ ] Supplier: accept PO → dispatch lots → mill store sees pre-filled GRN
- [ ] Operator: start, add production offline + online, create roll, breakdown → supervisor push
- [ ] QC: scan → pass / rework / reject with photo; duplicate scans ignored
- [ ] Dispatch scan on phone: wrong order / not passed / duplicate show red rows
- [ ] Owner: KPIs load; approve OT from Alerts; AI answers with a chart
- [ ] Logout clears everything; reopening the app asks for login
- [ ] Dark mode readable; small screen (360 × 640) has no cut-off buttons

---

## 19. Phase plan and checklist

Start mobile **after the web core (Phases 0–7 of the overall plan) works**. Mobile reuses the same APIs, so it's mostly screens.

| Phase | Work | Done when |
|---|---|---|
| M0. Setup | Workspaces + `packages/shared` (move api / status / format / permissions / portals / textile from web), Expo app, Router, Paper theme, supabase-js, http + api, query client + persister | App logs in and lists the user's orgs |
| M1. Shell | Select org + switcher, `experienceFor` routing, tab groups with permission filtering, push registration, socket, offline banner, notifications, deep links, version check | Each demo role lands on its own tabs; a test push arrives |
| M2. Transport + driver | Requests, assign, trip detail, driver next-step button, OTP + photo POD, queued status | A full trip runs across two phones |
| M3. Buyer | Orders, new order from catalog, live order detail, deliveries + OTP, bills + payment | Buyer watches live updates and receives the OTP |
| M4. Floor | Operator, QC station, dispatch scan, store GRN, supervisor area + attendance grid, maintenance, gate, roll trace, offline queue for floor actions | Operator → QC → dispatch flow on phones |
| M5. Supplier | POs respond, dispatch lots, invoices, quality feedback | PO → supplier dispatch → mill gate |
| M6. Owner lite | Home KPIs, alerts + approvals, orders, AI chat, board view, optional kiosk mode | Owner approves OT and asks the AI from the phone |
| M7. Polish + release | States, haptics, dark mode, airplane-mode tests, APK build, demo accounts | Demo runs on real phones 3 times in a row |

**If time is short:** M0 → M1 → M2 → M3 first (driver + buyer tell the B2B story best), then M4 (operator + QC).

**Ownership:** C (floor & logistics) owns mobile; B helps with shared UI patterns; A adds the backend changes in §16.

### Checklist

- [ ] M0: workspaces, shared package used by web and mobile, Expo app boots on a phone
- [ ] M0: login / signup / forgot; demo switcher (dev)
- [ ] M1: select org, switcher sheet, `experienceFor`, tab guards
- [ ] M1: push registration + tap-to-open; socket; offline banner; notifications list; deep links; version check
- [ ] M2: transporter requests / active / assign / fleet / freight bill
- [ ] M2: driver trips, next-step button, OTP + photo, queued steps
- [ ] M3: buyer orders, new order, detail (live), deliveries + OTP, bills + payment, connect mill
- [ ] M4: operator, QC, dispatch scan, store GRN, supervisor area + attendance, maintenance, gate, roll trace
- [ ] M4: offline queue for floor actions + pending-actions screen
- [ ] M5: supplier POs, dispatch lots, invoices, quality feedback
- [ ] M6: owner home, alerts + approvals, orders, AI chat, board view, kiosk mode (optional)
- [ ] M7: QA checklist (§18.2) on 2+ Android phones; preview APK shared

---

## 20. Demo moments

1. The **judge's phone** (buyer account) gets a push: "ORD-0142 is ready to ship".
2. The **driver's phone** goes into airplane mode, taps "In transit" → "Queued" → airplane mode off → the mill's web dashboard updates live.
3. The **buyer's phone** shows the OTP → the driver enters it → "Delivered" appears on all three screens at once.
4. The **QC phone** scans a roll → reject → the owner's phone gets the insight "W-3 defect rate high".
5. The **owner** approves overtime from the Alerts tab in one tap.

---

## 21. Scope note

A second client app adds roughly 25–35% more frontend work. If the hackathon is under 48 hours:
- build only **driver + buyer + QC scan** in React Native, or
- make the web app a **PWA** (installable, camera works over HTTPS) and skip native.

The native app is worth it for **push notifications, offline queueing, faster camera scanning and installable APKs** — those are what make the demo stand out.
