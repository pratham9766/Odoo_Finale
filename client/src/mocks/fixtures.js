/**
 * Deterministic relational fixtures for TexLink demo mode.
 * All IDs are stable UUIDs so components can reference them.
 * Dashboard KPIs derived from these records — no independent hardcoding.
 *
 * Tenant: Everest Textile Mills (mill) + Isolation Tenant (proves RLS)
 * Demo: org-1 = Everest | org-2 = isolation | org-3 = buyer | org-4 = supplier
 */

// ─── Organizations ────────────────────────────────────────────────────────
export const ORGS = {
  everest: {
    id: 'org-everest-001',
    name: 'Everest Textile Mills',
    types: ['manufacturer'],
    connect_code: 'EVER-2026',
    status: 'active',
    city: 'Surat',
    state: 'Gujarat',
    gstin: '24AABCE1234F1Z5',
    modules: { inventory: true, production: true, quality: true, dispatch: true, workforce: true, finance: true, ai: true },
  },
  isolation: {
    id: 'org-isolation-002',
    name: 'Shree Fabrics',
    types: ['manufacturer'],
    connect_code: 'SHRF-2026',
    status: 'active',
    city: 'Ahmedabad',
  },
  buyer: {
    id: 'org-buyer-003',
    name: 'Tiruppur Garments Ltd',
    types: ['buyer'],
    connect_code: 'TIGL-2026',
    status: 'active',
    city: 'Tiruppur',
  },
  supplier: {
    id: 'org-supplier-004',
    name: 'Rajasthan Yarn Co.',
    types: ['supplier'],
    connect_code: 'RYCO-2026',
    status: 'active',
    city: 'Bhilwara',
  },
};

// ─── Demo users ───────────────────────────────────────────────────────────
export const DEMO_USERS = [
  { id: 'u-owner', email: 'owner@everest.test', password: 'demo123', name: 'Suresh Mehta', role: 'Owner', orgId: ORGS.everest.id },
  { id: 'u-prod', email: 'production@everest.test', password: 'demo123', name: 'Priya Sharma', role: 'Production Manager', orgId: ORGS.everest.id },
  { id: 'u-supervisor', email: 'supervisor@everest.test', password: 'demo123', name: 'Ravi Kumar', role: 'Shift Supervisor', orgId: ORGS.everest.id },
  { id: 'u-operator', email: 'operator@everest.test', password: 'demo123', name: 'Anil Patil', role: 'Machine Operator', orgId: ORGS.everest.id },
  { id: 'u-qc', email: 'qc@everest.test', password: 'demo123', name: 'Meena Joshi', role: 'QC Inspector', orgId: ORGS.everest.id },
  { id: 'u-dispatch', email: 'dispatch@everest.test', password: 'demo123', name: 'Deepak Singh', role: 'Dispatch In-charge', orgId: ORGS.everest.id },
  { id: 'u-accounts', email: 'accounts@everest.test', password: 'demo123', name: 'Kavitha Nair', role: 'Accountant', orgId: ORGS.everest.id },
  { id: 'u-buyer', email: 'buyer@tiruppur.test', password: 'demo123', name: 'Arjun Reddy', role: 'Owner', orgId: ORGS.buyer.id },
];

// ─── Roles with permissions ───────────────────────────────────────────────
export const ROLES = {
  owner: {
    id: 'role-owner',
    name: 'Owner',
    rank: 100,
    permissions: new Set([
      'orders.view', 'orders.create', 'orders.view_price', 'orders.cancel',
      'stock.view', 'stock.adjust', 'receipt.create',
      'items.view', 'items.manage', 'bom.view', 'bom.manage',
      'po.view', 'po.create',
      'production.view', 'production.log', 'production.plan', 'assignment.manage',
      'breakdown.report', 'maintenance.fix',
      'qc.view', 'qc.inspect', 'qc.override',
      'gate.log', 'gate.view',
      'dispatch.view', 'dispatch.create', 'dispatch.confirm',
      'transport.manage',
      'workers.manage', 'attendance.view', 'attendance.mark', 'attendance.approve',
      'wages.view', 'wages.run', 'wages.pay',
      'invoice.view', 'invoice.create', 'payment.record', 'expense.manage',
      'reports.production', 'reports.qc', 'reports.cost', 'reports.pnl', 'reports.attendance',
      'partners.view', 'partners.connect', 'partners.approve',
      'staff.view', 'staff.invite', 'staff.edit_role', 'roles.manage', 'settings.manage',
      'ai.chat',
    ]),
  },
  production_manager: {
    id: 'role-prod-mgr',
    name: 'Production Manager',
    rank: 80,
    permissions: new Set([
      'orders.view', 'production.view', 'production.log', 'production.plan',
      'assignment.manage', 'breakdown.report', 'qc.view', 'gate.view',
      'stock.view', 'dispatch.view', 'attendance.view',
      'reports.production', 'reports.qc', 'reports.attendance', 'ai.chat',
    ]),
  },
  supervisor: {
    id: 'role-supervisor',
    name: 'Shift Supervisor',
    rank: 60,
    permissions: new Set([
      'orders.view', 'production.view', 'production.log', 'assignment.manage',
      'breakdown.report', 'attendance.view', 'attendance.mark',
      'qc.view', 'stock.view', 'dispatch.view', 'reports.production',
    ]),
    scope: { stage_ids: ['stage-weaving'], machine_ids: ['m-w1','m-w2','m-w3','m-w4'], shift_ids: ['shift-a'] },
  },
  operator: {
    id: 'role-operator',
    name: 'Machine Operator',
    rank: 20,
    permissions: new Set(['production.log', 'breakdown.report']),
    scope: { machine_ids: ['m-w3'] },
  },
  qc_inspector: {
    id: 'role-qc',
    name: 'QC Inspector',
    rank: 40,
    permissions: new Set(['qc.view', 'qc.inspect', 'stock.view']),
  },
  dispatch: {
    id: 'role-dispatch',
    name: 'Dispatch In-charge',
    rank: 40,
    permissions: new Set([
      'dispatch.view', 'dispatch.create', 'dispatch.confirm',
      'stock.view', 'invoice.view', 'gate.view', 'orders.view',
    ]),
  },
  accountant: {
    id: 'role-accountant',
    name: 'Accountant',
    rank: 70,
    permissions: new Set([
      'invoice.view', 'invoice.create', 'payment.record', 'expense.manage',
      'wages.view', 'wages.pay', 'orders.view', 'reports.cost', 'reports.pnl',
      'reports.attendance', 'ai.chat',
    ]),
  },
  buyer_owner: {
    id: 'role-buyer-owner',
    name: 'Owner',
    rank: 100,
    permissions: new Set([
      'orders.view', 'orders.create', 'orders.view_price',
      'dispatch.view', 'invoice.view', 'payment.record',
      'partners.view', 'partners.connect', 'reports.production',
    ]),
  },
};

// ─── Stages ───────────────────────────────────────────────────────────────
export const STAGES = [
  { id: 'stage-spinning',  name: 'Spinning',  sequence: 1, output_kind: 'yarn' },
  { id: 'stage-weaving',   name: 'Weaving',   sequence: 2, output_kind: 'grey_fabric' },
  { id: 'stage-dyeing',    name: 'Dyeing',    sequence: 3, output_kind: 'finished_fabric' },
];

// ─── Machines ─────────────────────────────────────────────────────────────
export const MACHINES = [
  // Spinning
  { id: 'm-s1', code: 'S-1', name: 'Ring Frame 1',  stage_id: 'stage-spinning', status: 'running',     capacity_per_hour: 12, capacity_uom: 'kg', current_work_order_id: 'wo-003', produced_today: 84,  operator: 'Rajesh M.' },
  { id: 'm-s2', code: 'S-2', name: 'Ring Frame 2',  stage_id: 'stage-spinning', status: 'idle',        capacity_per_hour: 12, capacity_uom: 'kg', current_work_order_id: null,     produced_today: 0,   operator: null },
  { id: 'm-s3', code: 'S-3', name: 'Ring Frame 3',  stage_id: 'stage-spinning', status: 'running',     capacity_per_hour: 10, capacity_uom: 'kg', current_work_order_id: 'wo-005', produced_today: 60,  operator: 'Sunil T.' },
  // Weaving
  { id: 'm-w1', code: 'W-1', name: 'Power Loom 1',  stage_id: 'stage-weaving',  status: 'running',     capacity_per_hour: 80, capacity_uom: 'm',  current_work_order_id: 'wo-001', produced_today: 540, operator: 'Anil P.' },
  { id: 'm-w2', code: 'W-2', name: 'Power Loom 2',  stage_id: 'stage-weaving',  status: 'running',     capacity_per_hour: 80, capacity_uom: 'm',  current_work_order_id: 'wo-002', produced_today: 480, operator: 'Ramesh K.' },
  { id: 'm-w3', code: 'W-3', name: 'Power Loom 3',  stage_id: 'stage-weaving',  status: 'breakdown',   capacity_per_hour: 80, capacity_uom: 'm',  current_work_order_id: 'wo-006', produced_today: 160, operator: 'Vijay S.', breakdown_since: '2026-10-10T07:30:00Z', breakdown_reason: 'Motor fault' },
  { id: 'm-w4', code: 'W-4', name: 'Power Loom 4',  stage_id: 'stage-weaving',  status: 'running',     capacity_per_hour: 80, capacity_uom: 'm',  current_work_order_id: 'wo-007', produced_today: 620, operator: 'Pankaj D.' },
  // Dyeing
  { id: 'm-d1', code: 'D-1', name: 'Jet Dyeing 1',  stage_id: 'stage-dyeing',   status: 'running',     capacity_per_hour: 60, capacity_uom: 'm',  current_work_order_id: 'wo-008', produced_today: 360, operator: 'Hira L.' },
  { id: 'm-d2', code: 'D-2', name: 'Jet Dyeing 2',  stage_id: 'stage-dyeing',   status: 'maintenance', capacity_per_hour: 60, capacity_uom: 'm',  current_work_order_id: null,     produced_today: 0,   operator: null },
];

// ─── Orders ───────────────────────────────────────────────────────────────
export const ORDERS = [
  {
    id: 'ord-001',
    order_no: 'ORD-2026-0142',
    seller_org_id: ORGS.everest.id,
    buyer_org_id: ORGS.buyer.id,
    buyer_name: 'Tiruppur Garments Ltd',
    order_date: '2026-09-28',
    deadline: '2026-10-18',
    priority: 'high',
    status: 'in_production',
    progress_pct: 72,
    current_stage: 'Weaving',
    risk: 'green',
    expected_completion: '2026-10-16',
    tracking_token: 'tk-pub-001',
    lines: [{ item_name: 'Twill Fabric', colour: 'Red', qty: 1200, uom: 'm', rate: 280 }],
    ordered_qty: 1200,
    produced_qty: 920,
    qc_approved_qty: 720,
    dispatched_qty: 600,
    remaining_qty: 600,
  },
  {
    id: 'ord-002',
    order_no: 'ORD-2026-0151',
    seller_org_id: ORGS.everest.id,
    buyer_org_id: ORGS.buyer.id,
    buyer_name: 'Tiruppur Garments Ltd',
    order_date: '2026-10-01',
    deadline: '2026-10-25',
    priority: 'normal',
    status: 'material_ready',
    progress_pct: 0,
    current_stage: null,
    risk: 'green',
    expected_completion: null,
    lines: [{ item_name: 'Poplin Fabric', colour: 'White', qty: 800, uom: 'm', rate: 220 }],
    ordered_qty: 800, produced_qty: 0, qc_approved_qty: 0, dispatched_qty: 0, remaining_qty: 800,
  },
  {
    id: 'ord-003',
    order_no: 'ORD-2026-0138',
    seller_org_id: ORGS.everest.id,
    buyer_org_id: null,
    buyer_name: 'Bhiwandi Traders (offline)',
    order_date: '2026-09-20',
    deadline: '2026-10-08',
    priority: 'urgent',
    status: 'ready_to_ship',
    progress_pct: 100,
    current_stage: 'Dispatching',
    risk: 'red',
    expected_completion: '2026-10-12',
    lines: [{ item_name: 'Satin Fabric', colour: 'Navy', qty: 500, uom: 'm', rate: 350 }],
    ordered_qty: 500, produced_qty: 510, qc_approved_qty: 490, dispatched_qty: 0, remaining_qty: 490,
  },
  {
    id: 'ord-004',
    order_no: 'ORD-2026-0155',
    seller_org_id: ORGS.everest.id,
    buyer_org_id: ORGS.buyer.id,
    buyer_name: 'Tiruppur Garments Ltd',
    order_date: '2026-10-05',
    deadline: '2026-11-05',
    priority: 'normal',
    status: 'waiting_material',
    progress_pct: 0,
    current_stage: null,
    risk: 'amber',
    expected_completion: null,
    lines: [{ item_name: 'Twill Fabric', colour: 'Blue', qty: 1000, uom: 'm', rate: 280 }],
    ordered_qty: 1000, produced_qty: 0, qc_approved_qty: 0, dispatched_qty: 0, remaining_qty: 1000,
  },
  {
    id: 'ord-005',
    order_no: 'ORD-2026-0129',
    seller_org_id: ORGS.everest.id,
    buyer_org_id: ORGS.buyer.id,
    buyer_name: 'Tiruppur Garments Ltd',
    order_date: '2026-09-01',
    deadline: '2026-09-30',
    priority: 'normal',
    status: 'delivered',
    progress_pct: 100,
    current_stage: null,
    risk: 'green',
    lines: [{ item_name: 'Cotton Fabric', colour: 'Beige', qty: 600, uom: 'm', rate: 200 }],
    ordered_qty: 600, produced_qty: 615, qc_approved_qty: 600, dispatched_qty: 600, remaining_qty: 0,
  },
];

// ─── Stock ────────────────────────────────────────────────────────────────
export const STOCK = [
  { id: 'si-001', item_name: 'Cotton Yarn 40s', kind: 'yarn', colour: 'Natural', uom: 'kg', on_hand: 240, reserved: 35, reorder_level: 100, std_rate: 180 },
  { id: 'si-002', item_name: 'Cotton Yarn 30s', kind: 'yarn', colour: 'Red',     uom: 'kg', on_hand: 15,  reserved: 10, reorder_level: 80,  std_rate: 165 },
  { id: 'si-003', item_name: 'Cotton Yarn 30s', kind: 'yarn', colour: 'White',   uom: 'kg', on_hand: 180, reserved: 60, reorder_level: 80,  std_rate: 165 },
  { id: 'si-004', item_name: 'Reactive Dye',    kind: 'dye',  colour: 'Red',     uom: 'kg', on_hand: 12,  reserved: 2,  reorder_level: 5,   std_rate: 420 },
  { id: 'si-005', item_name: 'Reactive Dye',    kind: 'dye',  colour: 'Navy',    uom: 'kg', on_hand: 8,   reserved: 4,  reorder_level: 5,   std_rate: 450 },
  { id: 'si-006', item_name: 'Twill Fabric FG', kind: 'finished_fabric', colour: 'Red', uom: 'm', on_hand: 490, reserved: 0, reorder_level: 0, std_rate: 280 },
  { id: 'si-007', item_name: 'Cotton Fibre',    kind: 'fibre', colour: 'Natural', uom: 'kg', on_hand: 500, reserved: 105, reorder_level: 200, std_rate: 95 },
];

// Derived: available = on_hand - reserved
STOCK.forEach(s => { s.available = s.on_hand - s.reserved; });

// ─── QC Rolls ─────────────────────────────────────────────────────────────
export const ROLLS = [
  { id: 'r-001', roll_no: 'R-0142-001', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 52, weight_kg: 38.5, status: 'passed',     dye_batch: 'B7', work_order_id: 'wo-001', machine_code: 'W-1' },
  { id: 'r-002', roll_no: 'R-0142-002', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 48, weight_kg: 35.5, status: 'passed',     dye_batch: 'B7', work_order_id: 'wo-001', machine_code: 'W-1' },
  { id: 'r-003', roll_no: 'R-0142-003', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 50, weight_kg: 37.0, status: 'rework',     dye_batch: 'B7', work_order_id: 'wo-002', machine_code: 'W-2' },
  { id: 'r-004', roll_no: 'R-0142-004', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 55, weight_kg: 40.7, status: 'rejected',   dye_batch: 'B7', work_order_id: 'wo-003', machine_code: 'W-3' },
  { id: 'r-005', roll_no: 'R-0142-005', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 52, weight_kg: 38.5, status: 'pending_qc', dye_batch: 'B7', work_order_id: 'wo-001', machine_code: 'W-1' },
  { id: 'r-006', roll_no: 'R-0142-006', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 50, weight_kg: 37.0, status: 'passed',     dye_batch: 'B8', work_order_id: 'wo-004', machine_code: 'W-4' },
  { id: 'r-007', roll_no: 'R-0142-007', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 52, weight_kg: 38.5, status: 'passed',     dye_batch: 'B8', work_order_id: 'wo-004', machine_code: 'W-4' },
  { id: 'r-008', roll_no: 'R-0142-008', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 48, weight_kg: 35.5, status: 'passed',     dye_batch: 'B8', work_order_id: 'wo-004', machine_code: 'W-4' },
  { id: 'r-009', roll_no: 'R-0142-009', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 52, weight_kg: 38.5, status: 'dispatched', dye_batch: 'B7', work_order_id: 'wo-001', machine_code: 'W-1' },
  { id: 'r-010', roll_no: 'R-0142-010', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 200, weight_kg: 148, status: 'passed',     dye_batch: 'B8', work_order_id: 'wo-004', machine_code: 'W-4' },
  { id: 'r-011', roll_no: 'R-0142-011', order_no: 'ORD-2026-0142', item_name: 'Twill Fabric', colour: 'Red', length_m: 200, weight_kg: 148, status: 'passed',     dye_batch: 'B8', work_order_id: 'wo-004', machine_code: 'W-4' },
];

// ─── Dispatches ───────────────────────────────────────────────────────────
export const DISPATCHES = [
  {
    id: 'dsp-001',
    dispatch_no: 'DSP-2026-0079',
    order_no: 'ORD-2026-0142',
    order_id: 'ord-001',
    buyer_name: 'Tiruppur Garments Ltd',
    kind: 'sales',
    status: 'in_transit',
    vehicle_no: 'GJ05AB1234',
    driver_name: 'Ramesh Driver',
    driver_phone: '9876543210',
    rolls_count: 10,
    total_length_m: 600,
    confirmed_at: '2026-10-09T14:00:00Z',
  },
];

// ─── Invoices ─────────────────────────────────────────────────────────────
export const INVOICES = [
  {
    id: 'inv-001',
    invoice_no: 'INV-2026-0213',
    kind: 'sales',
    order_no: 'ORD-2026-0142',
    buyer_name: 'Tiruppur Garments Ltd',
    invoice_date: '2026-10-09',
    due_date: '2026-10-24',
    total_amount: 168000,
    paid_amount: 168000,
    outstanding: 0,
    status: 'paid',
  },
  {
    id: 'inv-002',
    invoice_no: 'INV-2026-0218',
    kind: 'sales',
    order_no: 'ORD-2026-0138',
    buyer_name: 'Bhiwandi Traders',
    invoice_date: '2026-10-01',
    due_date: '2026-10-16',
    total_amount: 175000,
    paid_amount: 0,
    outstanding: 175000,
    status: 'overdue',
  },
];

// ─── Attendance today (shift A, 2026-10-10) ───────────────────────────────
export const ATTENDANCE_TODAY = {
  shift: 'Shift A',
  date: '2026-10-10',
  summary: { present: 46, late: 4, absent: 3, leave: 2, ot: 5, total: 55 },
  by_stage: [
    { stage: 'Spinning', present: 14, total: 16 },
    { stage: 'Weaving',  present: 20, total: 22 },
    { stage: 'Dyeing',   present: 12, total: 14 },
    { stage: 'Other',    present: 4,  total: 5 },
  ],
  absent_workers: [
    { id: 'w-011', name: 'Mohan Sharma', stage: 'Weaving', machine: 'W-3', badge: 'EMP-011' },
    { id: 'w-023', name: 'Dinesh Patel',  stage: 'Weaving', machine: 'W-4', badge: 'EMP-023' },
    { id: 'w-041', name: 'Sita Devi',     stage: 'Dyeing',  machine: null,  badge: 'EMP-041' },
  ],
};

// ─── Dashboard metrics (derived from fixtures above) ─────────────────────
export const DASHBOARD = {
  today_output_m: 1800,  // sum of machine produced_today for m
  running_machines: 5,
  idle_machines: 1,
  breakdown_machines: 1,
  maintenance_machines: 1,
  total_machines: 8,
  utilisation_pct: 67,
  orders_at_risk: ORDERS.filter(o => o.risk === 'red' || o.risk === 'amber').length,
  workers_present: ATTENDANCE_TODAY.summary.present,
  workers_total: ATTENDANCE_TODAY.summary.total,
  profit_this_month: 650000,
  profit_delta_pct: 12,
  low_stock_count: STOCK.filter(s => s.available <= s.reorder_level && s.reorder_level > 0).length,
  alerts: [
    { type: 'breakdown',  message: 'W-3 breakdown since 07:30 — Motor fault', link: '/app/production/board' },
    { type: 'low_stock',  message: 'Cotton Yarn 30s (Red) — only 5 kg available', link: '/app/inventory/stock' },
    { type: 'overdue',    message: 'INV-2026-0218 overdue — ₹1,75,000 from Bhiwandi Traders', link: '/app/finance/invoices' },
    { type: 'at_risk',    message: 'ORD-2026-0138 missed deadline (8 Oct) — still not dispatched', link: '/app/orders/ord-003' },
  ],
  production_chart: [
    { date: '04 Oct', spinning: 85,  weaving: 1580, dyeing: 720 },
    { date: '05 Oct', spinning: 90,  weaving: 1720, dyeing: 780 },
    { date: '06 Oct', spinning: 0,   weaving: 0,    dyeing: 0 },   // Sunday
    { date: '07 Oct', spinning: 88,  weaving: 1640, dyeing: 760 },
    { date: '08 Oct', spinning: 92,  weaving: 1800, dyeing: 800 },
    { date: '09 Oct', spinning: 78,  weaving: 1420, dyeing: 680 },
    { date: '10 Oct', spinning: 60,  weaving: 1800, dyeing: 360 },  // today, partial
  ],
};
