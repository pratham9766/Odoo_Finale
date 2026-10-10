import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Result } from 'antd';
import { useSession } from '@/context/Session';
import AppLayout from '@/layouts/AppLayout';
import FloorLayout from '@/layouts/FloorLayout';

const page = (loader, name = 'default') => lazy(() => loader().then((m) => ({ default: m[name] })));

const Dashboard = lazy(() => import('@/features/Dashboard'));
const Orders = lazy(() => import('@/features/Orders'));
const CreateOrder = lazy(() => import('@/features/CreateOrder'));
const OrderDetail = lazy(() => import('@/features/OrderDetail'));
const Stock = lazy(() => import('@/features/Stock'));
const Boms = lazy(() => import('@/features/Boms'));
const Settings = lazy(() => import('@/features/Settings'));
const Attendance = lazy(() => import('@/features/Attendance'));
const Wages = lazy(() => import('@/features/Wages'));
const Finance = lazy(() => import('@/features/Finance'));
const Reports = lazy(() => import('@/features/Reports'));
const Staff = lazy(() => import('@/features/Staff'));
const Roles = lazy(() => import('@/features/Roles'));
const Profile = lazy(() => import('@/features/Profile'));
const FloorSupervisor = lazy(() => import('@/features/Floor'));

const Receipts = page(() => import('@/features/Receipts'), 'Receipts');
const NewReceipt = page(() => import('@/features/Receipts'), 'NewReceipt');
const ReceiptDetail = page(() => import('@/features/Receipts'), 'ReceiptDetail');
const Contacts = page(() => import('@/features/Masters'), 'Contacts');
const Items = page(() => import('@/features/Masters'), 'Items');
const Machines = page(() => import('@/features/Masters'), 'Machines');
const Workers = page(() => import('@/features/Masters'), 'Workers');
const MachineBoard = page(() => import('@/features/Production'), 'MachineBoard');
const WorkOrders = page(() => import('@/features/Production'), 'WorkOrders');
const Assignments = page(() => import('@/features/Production'), 'Assignments');
const Maintenance = page(() => import('@/features/Production'), 'Maintenance');
const Quality = page(() => import('@/features/Quality'), 'Quality');
const RollTrace = page(() => import('@/features/Quality'), 'RollTrace');
const Dispatches = page(() => import('@/features/Dispatch'), 'Dispatches');
const NewDispatch = page(() => import('@/features/Dispatch'), 'NewDispatch');
const DispatchDetail = page(() => import('@/features/Dispatch'), 'DispatchDetail');

/** a screen that needs one of these permissions (a string, or a list: any one is enough) */
function Gate({ permission, children }) {
  const session = useSession();
  const list = [permission].flat();
  return list.some((p) => session.can(p))
    ? children
    : <Result status="403" title="Access restricted" subTitle="Your role does not include this. Ask the mill owner to update your role in Roles & permissions." />;
}

/** after login: floor staff go to their tablet screen, everyone else to the dashboard */
function Home() {
  const s = useSession();
  const office = s.can('orders.view') || s.can('stock.view') || s.can('invoice.view') || s.can('production.plan');
  let to = '/app';
  if (!office) {
    if (s.can('production.log')) to = '/floor/machine';
    else if (s.can('qc.inspect')) to = '/floor/qc';
    else if (s.can('assignment.create') || s.can('attendance.mark')) to = '/floor/supervisor';
    else if (s.can('dispatch.create')) to = '/floor/dispatch';
  }
  return <Navigate to={to} replace />;
}

const G = (permission, element) => <Gate permission={permission}>{element}</Gate>;

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={G('orders.view', <Orders />)} />
        <Route path="orders/new" element={G('orders.create', <CreateOrder />)} />
        <Route path="orders/:id" element={G('orders.view', <OrderDetail />)} />
        <Route path="contacts" element={G('contacts.view', <Contacts />)} />
        <Route path="stock" element={G('stock.view', <Stock />)} />
        <Route path="receipts" element={G(['receipt.view', 'receipt.create', 'stock.view'], <Receipts />)} />
        <Route path="receipts/new" element={G('receipt.create', <NewReceipt />)} />
        <Route path="receipts/:id" element={G(['receipt.view', 'receipt.create', 'stock.view'], <ReceiptDetail />)} />
        <Route path="items" element={G('items.view', <Items />)} />
        <Route path="boms" element={G('bom.view', <Boms />)} />
        <Route path="production" element={G('production.view', <MachineBoard />)} />
        <Route path="work-orders" element={G('production.view', <WorkOrders />)} />
        <Route path="assignments" element={G(['assignment.view', 'assignment.create'], <Assignments />)} />
        <Route path="maintenance" element={G(['breakdown.report', 'maintenance.fix', 'breakdown.close'], <Maintenance />)} />
        <Route path="machines" element={G(['machines.view', 'production.view'], <Machines />)} />
        <Route path="quality" element={G('qc.view', <Quality />)} />
        <Route path="rolls/:rollNo" element={G('qc.view', <RollTrace />)} />
        <Route path="dispatch" element={G('dispatch.view', <Dispatches />)} />
        <Route path="dispatch/new" element={G('dispatch.create', <NewDispatch />)} />
        <Route path="dispatch/:id" element={G('dispatch.view', <DispatchDetail />)} />
        <Route path="attendance" element={G('attendance.view', <Attendance />)} />
        <Route path="workers" element={G(['workers.view', 'attendance.view'], <Workers />)} />
        <Route path="wages" element={G('wages.view', <Wages />)} />
        <Route path="finance" element={G(['invoice.view', 'payment.view', 'expense.view'], <Finance />)} />
        <Route path="reports" element={G(['reports.cost', 'reports.pnl', 'reports.production', 'reports.qc', 'reports.attendance', 'wages.view'], <Reports />)} />
        <Route path="staff" element={G('staff.view', <Staff />)} />
        <Route path="roles" element={G('roles.view', <Roles />)} />
        <Route path="settings" element={G(['settings.update', 'settings.create'], <Settings />)} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Result status="404" title="Page not found" extra={<a href="/app">Back to the dashboard</a>} />} />
      </Route>

      <Route path="/floor" element={<FloorLayout />}>
        <Route index element={<Home />} />
        <Route path="machine" element={G('production.log', <MachineBoard mine floor />)} />
        <Route path="supervisor" element={G(['assignment.create', 'attendance.mark'], <FloorSupervisor />)} />
        <Route path="qc" element={G('qc.inspect', <Quality floor />)} />
        <Route path="dispatch" element={G('dispatch.create', <Dispatches floor />)} />
        <Route path="dispatch/new" element={G('dispatch.create', <NewDispatch floor />)} />
        <Route path="dispatch/:id" element={G('dispatch.create', <DispatchDetail floor />)} />
      </Route>

      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Home />} />
      <Route path="*" element={<Result status="404" title="Page not found" extra={<a href="/">Back to start</a>} />} />
    </Routes>
  );
}
