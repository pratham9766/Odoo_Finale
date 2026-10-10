import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Spin } from 'antd';

// Guards
import ProtectedRoute from '@/guards/ProtectedRoute';
import StaffRequired  from '@/guards/StaffRequired';
import PermissionGuard from '@/guards/PermissionGuard';

// Layouts
import AuthLayout  from '@/layouts/AuthLayout';
import AppLayout   from '@/layouts/AppLayout';
import FloorLayout from '@/layouts/FloorLayout';

// Portals & Context
import { homeFor } from '@/config/portals';
import { useMill } from '@/hooks/useMill';

// ── Lazy pages ────────────────────────────────────────────────────────────
const LandingPage  = lazy(() => import('@/features/public/pages/LandingPage'));
const LoginPage    = lazy(() => import('@/features/auth/pages/LoginPage'));
const ForgotPage   = lazy(() => import('@/features/auth/pages/ForgotPage'));
const AuthCallback = lazy(() => import('@/features/auth/pages/AuthCallback'));
const AcceptInvitePage = lazy(() => import('@/features/auth/pages/AcceptInvitePage'));

// Mill office
const DashboardPage       = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const OrdersListPage      = lazy(() => import('@/features/orders/pages/OrdersListPage'));
const OrderDetailPage     = lazy(() => import('@/features/orders/pages/OrderDetailPage'));
const OrderCreatePage     = lazy(() => import('@/features/orders/pages/OrderCreatePage'));
const StockPage           = lazy(() => import('@/features/inventory/pages/StockPage'));
const ReceiptsPage        = lazy(() => import('@/features/inventory/pages/ReceiptsPage'));
const NewReceiptPage      = lazy(() => import('@/features/inventory/pages/NewReceiptPage'));
const MachineBoardPage    = lazy(() => import('@/features/production/pages/MachineBoardPage'));
const WorkOrdersPage      = lazy(() => import('@/features/production/pages/WorkOrdersPage'));
const QualityPage         = lazy(() => import('@/features/quality/pages/QualityPage'));
const RollTracePage       = lazy(() => import('@/features/quality/pages/RollTracePage'));
const DispatchListPage    = lazy(() => import('@/features/dispatch/pages/DispatchListPage'));
const NewDispatchPage     = lazy(() => import('@/features/dispatch/pages/NewDispatchPage'));
const DispatchScanPage    = lazy(() => import('@/features/dispatch/pages/DispatchScanPage'));
const AttendanceTodayPage = lazy(() => import('@/features/workforce/pages/AttendanceTodayPage'));
const WorkersPage         = lazy(() => import('@/features/workforce/pages/WorkersPage'));
const WagesPage           = lazy(() => import('@/features/workforce/pages/WagesPage'));
const InvoicesPage        = lazy(() => import('@/features/finance/pages/InvoicesPage'));
const PaymentsPage        = lazy(() => import('@/features/finance/pages/PaymentsPage'));
const BillsPage           = lazy(() => import('@/features/finance/pages/BillsPage'));
const OrderCostPage       = lazy(() => import('@/features/reports/pages/OrderCostPage'));
const MaintenancePage     = lazy(() => import('@/features/maintenance/pages/MaintenancePage'));
const AssignmentsPage     = lazy(() => import('@/features/production/pages/AssignmentsPage'));
const PlanningPage        = lazy(() => import('@/features/production/pages/PlanningPage'));
const MachinesPage        = lazy(() => import('@/features/production/pages/MachinesPage'));
const RolesPage           = lazy(() => import('@/features/settings/pages/RolesPage'));
const StaffPage           = lazy(() => import('@/features/settings/pages/StaffPage'));
const ProfilePage         = lazy(() => import('@/features/settings/pages/ProfilePage'));

// Floor
const FloorMachinePage  = lazy(() => import('@/features/floor/pages/FloorMachinePage'));
const FloorSuperPage    = lazy(() => import('@/features/floor/pages/FloorSuperPage'));
const FloorQCPage       = lazy(() => import('@/features/floor/pages/FloorQCPage'));
const FloorDispatchPage = lazy(() => import('@/features/floor/pages/FloorDispatchPage'));

// Public
const PublicTrackPage   = lazy(() => import('@/features/public/pages/PublicTrackPage'));
const NotFoundPage      = lazy(() => import('@/features/public/pages/NotFoundPage'));

// ── Spinner fallback ──────────────────────────────────────────────────────
const PageSpinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
    <Spin size="large" />
  </div>
);

const s = (el) => <Suspense fallback={<PageSpinner />}>{el}</Suspense>;

// Permission guard helper
const guard = (anyOf, el) => (
  <PermissionGuard anyOf={anyOf}>{s(el)}</PermissionGuard>
);

// Home redirect — reads role & permissions and navigates
function HomeRedirect() {
  const { role, permissions } = useMill();
  return <Navigate to={homeFor(role, permissions)} replace />;
}

export const router = createBrowserRouter([
  // ── Public routes ──────────────────────────────────────────────────────
  { path: '/', element: s(<LandingPage />) },
  { path: '/track/:token', element: s(<PublicTrackPage />) },

  // ── Auth routes ────────────────────────────────────────────────────────
  {
    element: <AuthLayout />,
    children: [
      { path: '/login',         element: s(<LoginPage />) },
      { path: '/forgot',        element: s(<ForgotPage />) },
      { path: '/auth/callback', element: s(<AuthCallback />) },
      { path: '/invite/staff/:token', element: s(<AcceptInvitePage />) },
    ],
  },

  // ── Protected staff routes ─────────────────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <StaffRequired />,
        children: [
          { path: '/home', element: <HomeRedirect /> },

          // ── Mill office (/app) ────────────────────────────────────────
          {
            path: '/app',
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: s(<DashboardPage />) },

              // Orders
              { path: 'orders',     element: guard(['orders.view'], <OrdersListPage />) },
              { path: 'orders/new', element: guard(['orders.create'], <OrderCreatePage />) },
              { path: 'orders/:id', element: guard(['orders.view'], <OrderDetailPage />) },

              // Inventory
              { path: 'inventory/stock',        element: guard(['stock.view'], <StockPage />) },
              { path: 'inventory/receipts',     element: guard(['stock.view', 'receipt.create'], <ReceiptsPage />) },
              { path: 'inventory/receipts/new', element: guard(['receipt.create'], <NewReceiptPage />) },

              // Production
              { path: 'production/board',       element: guard(['production.view'], <MachineBoardPage />) },
              { path: 'production/work-orders', element: guard(['production.view'], <WorkOrdersPage />) },
              { path: 'production/assignments', element: guard(['assignment.manage'], <AssignmentsPage />) },

              // Settings / Setup items
              { path: 'settings/machines', element: guard(['production.view'], <MachinesPage />) },
              { path: 'settings/planning', element: guard(['production.plan'], <PlanningPage />) },
              { path: 'settings/roles', element: guard(['roles.manage'], <RolesPage />) },
              { path: 'settings/staff', element: guard(['staff.view'], <StaffPage />) },
              { path: 'profile', element: s(<ProfilePage />) },
              { path: 'maintenance/tickets', element: guard(['breakdown.report', 'maintenance.fix'], <MaintenancePage />) },

              // Quality
              { path: 'quality',        element: guard(['qc.view'], <QualityPage />) },
              { path: 'rolls/:rollNo',  element: guard(['qc.view'], <RollTracePage />) },

              // Dispatch
              { path: 'dispatch',     element: guard(['dispatch.view'], <DispatchListPage />) },
              { path: 'dispatch/new', element: guard(['dispatch.create'], <NewDispatchPage />) },
              { path: 'dispatch/:id', element: guard(['dispatch.view'], <DispatchScanPage />) },

              // Workforce
              { path: 'workforce/attendance/today', element: guard(['attendance.view'], <AttendanceTodayPage />) },
              { path: 'workforce/workers',          element: guard(['workers.manage'], <WorkersPage />) },
              { path: 'workforce/wages',            element: guard(['wages.view'], <WagesPage />) },

              // Finance
              { path: 'finance/invoices', element: guard(['invoice.view'], <InvoicesPage />) },
              { path: 'finance/bills',    element: guard(['invoice.view'], <BillsPage />) },
              { path: 'finance/payments', element: guard(['invoice.view'], <PaymentsPage />) },

              // Reports
              { path: 'reports/order-cost', element: guard(['reports.cost'], <OrderCostPage />) },
              { path: 'reports/pnl',        element: guard(['reports.pnl'], <OrderCostPage />) },
              { path: 'reports/machines',   element: guard(['reports.production'], <MachineBoardPage />) },

              // Catch-all inside /app
              { path: '*', element: <Navigate to="dashboard" replace /> },
            ],
          },

          // ── Floor portal (/floor) ─────────────────────────────────────
          {
            path: '/floor',
            element: <FloorLayout />,
            children: [
              { index: true, element: <Navigate to="machine" replace /> },
              { path: 'machine',      element: guard(['production.log'], <FloorMachinePage />) },
              { path: 'supervisor',   element: guard(['assignment.manage'], <FloorSuperPage />) },
              { path: 'qc',           element: guard(['qc.inspect'], <FloorQCPage />) },
              { path: 'dispatch',     element: guard(['dispatch.create'], <FloorDispatchPage />) },
              { path: 'dispatch/:id', element: guard(['dispatch.create'], <FloorDispatchPage />) },
            ],
          },
        ],
      },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────────────────
  { path: '*', element: s(<NotFoundPage />) },
]);
