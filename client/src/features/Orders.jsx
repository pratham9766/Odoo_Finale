import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Dropdown, Input, Select, Table } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { NoData, QueryState } from '@/components/States';
import { date, quantity } from '@/lib/format';
import '@/styles/orders.css';

/* Helper to get buyer initials for the avatar circle */
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* Helper for deadline relative indicators */
function formatRelativeDeadline(deadlineStr) {
  if (!deadlineStr) return '—';
  const target = new Date(deadlineStr);
  if (Number.isNaN(target.getTime())) return '—';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return 'Yesterday';
  return `${Math.abs(diffDays)} days ago`;
}

function getDeadlineClass(deadlineStr) {
  if (!deadlineStr) return '';
  const target = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays < 0) return 'delayed';
  return '';
}

function getStatusClass(status) {
  switch (status) {
    case 'in_production':
    case 'in_qc':
      return 'in-production';
    case 'ready_to_ship':
    case 'material_ready':
      return 'ready-dispatch';
    case 'dispatched':
    case 'partially_dispatched':
      return 'dispatched';
    case 'delayed':
      return 'delayed';
    case 'confirmed':
    case 'open':
      return 'open';
    case 'draft':
    default:
      return 'draft';
  }
}

function formatStatus(status) {
  if (!status) return 'Draft';
  switch (status) {
    case 'in_production':
      return 'In Production';
    case 'ready_to_ship':
      return 'Ready to Dispatch';
    case 'partially_dispatched':
      return 'Partially Dispatched';
    case 'material_ready':
      return 'Material Ready';
    case 'waiting_material':
      return 'Waiting Material';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ');
  }
}

function getPriorityClass(priority) {
  switch (priority) {
    case 'urgent':
    case 'high':
      return 'high';
    case 'normal':
    case 'medium':
      return 'medium';
    case 'low':
    default:
      return 'low';
  }
}

function formatPriority(priority) {
  if (!priority) return 'Normal';
  if (priority === 'normal') return 'Medium';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export default function Orders() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = params.get('status') || '';
  const priority = params.get('priority') || '';
  const q = params.get('q') || '';
  const [lastRefreshed] = useState(() => new Date());

  const query = useQuery({
    queryKey: [session.userId, session.orgId, 'orders', page, status, q, priority],
    queryFn: ({ signal }) => {
      const searchParams = new URLSearchParams({ page: String(page), limit: '25' });
      if (status) searchParams.set('status', status);
      if (q) searchParams.set('q', q);
      return session.api(`/orders?${searchParams}`, { signal });
    },
    refetchInterval: 30000,
  });

  function update(values) {
    const next = { q, status, priority, page: '1', ...values };
    setParams(next);
  }

  const rows = (query.data?.data || []).filter(row => {
    if (!priority) return true;
    if (priority === 'medium') return row.priority === 'normal' || row.priority === 'medium';
    return row.priority === priority;
  });

  const totalCount = query.data?.meta?.total ?? rows.length;

  /* Dynamically calculate KPI values based on live incoming data */
  const openOrdersCount = rows.filter(r =>
    ['draft', 'waiting_material', 'material_ready', 'confirmed'].includes(r.status)
  ).length;

  const inProductionCount = rows.filter(r =>
    ['in_production', 'in_qc'].includes(r.status)
  ).length;

  const readyToDispatchCount = rows.filter(r =>
    ['ready_to_ship', 'partially_dispatched'].includes(r.status)
  ).length;

  const delayedCount = rows.filter(r => {
    if (r.status === 'delayed' || r.risk === 'red') return true;
    if (!r.deadline) return false;
    const d = new Date(r.deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today && !['delivered', 'cancelled'].includes(r.status);
  }).length;

  /* Dynamically calculate Today's Dispatch list */
  const dispatchCandidates = rows.filter(r =>
    ['ready_to_ship', 'partially_dispatched', 'dispatched'].includes(r.status)
  );

  const dispatchQuantity = dispatchCandidates.reduce(
    (acc, r) => acc + Number(r.total_qty || 0),
    0
  );

  /* Dynamically calculate Order Health percentages */
  const totalForHealth = rows.length || 1;
  const healthDelayed = delayedCount;
  const healthAtRisk = rows.filter(r => r.risk === 'amber').length;
  const healthOnTrack = Math.max(0, rows.length - healthDelayed - healthAtRisk);

  const pctOnTrack = Math.round((healthOnTrack / totalForHealth) * 100);
  const pctAtRisk = Math.round((healthAtRisk / totalForHealth) * 100);
  const pctDelayed = Math.max(0, 100 - pctOnTrack - pctAtRisk);

  // SVG Donut calculation (circumference = 2 * PI * 38 ~= 238.76)
  const circ = 238.76;
  const strokeOnTrack = (pctOnTrack / 100) * circ;
  const strokeAtRisk = (pctAtRisk / 100) * circ;
  const strokeDelayed = (pctDelayed / 100) * circ;

  const columns = [
    {
      title: 'Order ID',
      dataIndex: 'order_no',
      sorter: (a, b) => (a.order_no || '').localeCompare(b.order_no || ''),
      render: (value, row) => (
        <Link className="order-id-link" to={`/app/orders/${row.id}`}>
          {value || `ORD-${row.id.slice(0, 6)}`}
        </Link>
      ),
    },
    {
      title: 'Buyer',
      dataIndex: 'buyer_name',
      sorter: (a, b) => (a.buyer_name || '').localeCompare(b.buyer_name || ''),
      render: value => (
        <div className="buyer-cell-wrapper">
          <span className="buyer-avatar-pill">{getInitials(value)}</span>
          <span className="buyer-name-text">{value || 'Direct Buyer'}</span>
        </div>
      ),
    },
    {
      title: 'Fabric',
      dataIndex: 'fabric_name',
      render: (value, row) => (
        <div className="fabric-cell-wrapper">
          <span className="fabric-title-text">{value || 'Finished Fabric'}</span>
          <span className="fabric-spec-text">
            {row.fabric_colour ? `${row.fabric_colour} · ${row.uom || 'm'}` : (row.buyer_ref || 'Standard weave')}
          </span>
        </div>
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'total_qty',
      sorter: (a, b) => Number(a.total_qty || 0) - Number(b.total_qty || 0),
      render: (value, row) => (
        <span className="qty-cell-text">
          {quantity(value)} {row.uom || 'm'}
        </span>
      ),
    },
    {
      title: 'Deadline',
      dataIndex: 'deadline',
      sorter: (a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0),
      render: value => (
        <div className="deadline-cell-wrapper">
          <span className="deadline-date-text">{date(value)}</span>
          <span className={`deadline-rel-text ${getDeadlineClass(value)}`}>
            {formatRelativeDeadline(value)}
          </span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: value => (
        <span className={`status-dot-tag ${getStatusClass(value)}`}>
          <span className="dot" />
          {formatStatus(value)}
        </span>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      render: value => (
        <span className={`priority-dot-tag ${getPriorityClass(value)}`}>
          <span className="dot" />
          {formatPriority(value)}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, row) => (
        <Dropdown
          menu={{
            items: [
              { key: 'view', label: <Link to={`/app/orders/${row.id}`}>View order details</Link> },
              { key: 'tracking', label: <Link to={`/app/orders/${row.id}`}>Tracking link</Link> },
            ],
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <button className="btn-row-action" type="button" aria-label="Order actions">
            ···
          </button>
        </Dropdown>
      ),
    },
  ];

  return (
    <div className="orders-page-container">
      {/* 1. Page Header */}
      <header className="orders-page-header">
        <div>
          <div className="orders-header-eyebrow">MILL OPERATIONS</div>
          <h1 className="orders-header-title">Orders</h1>
          <p className="orders-header-subtitle">
            Keep every commitment in view, from confirmation to dispatch.
          </p>
        </div>
        {session.can('orders.create') && (
          <Link to="/app/orders/new">
            <Button type="primary" size="large" className="btn-create-order-primary">
              + Create order
            </Button>
          </Link>
        )}
      </header>

      {/* 2. Top 4 KPI Summary Cards */}
      <section className="kpi-summary-row" aria-label="Orders Summary Metrics">
        {/* Card 1: Open Orders */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{openOrdersCount}</span>
              <span className="kpi-label">Open Orders</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-pill positive">
              ↑ +17% <span className="kpi-trend-context">vs last month</span>
            </span>
            <svg className="kpi-sparkline" viewBox="0 0 60 20" fill="none">
              <path d="M2 15 C 18 18, 32 6, 58 8" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 2: In Production */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{inProductionCount}</span>
              <span className="kpi-label">In Production</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-pill positive">
              ↑ +12% <span className="kpi-trend-context">vs last month</span>
            </span>
            <svg className="kpi-sparkline" viewBox="0 0 60 20" fill="none">
              <path d="M2 17 C 22 15, 34 8, 58 6" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 3: Ready to Dispatch */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square emerald">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{readyToDispatchCount}</span>
              <span className="kpi-label">Ready to Dispatch</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-pill positive">
              ↑ +28% <span className="kpi-trend-context">vs last month</span>
            </span>
            <svg className="kpi-sparkline" viewBox="0 0 60 20" fill="none">
              <path d="M2 16 C 18 19, 36 5, 58 7" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 4: Delayed */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square red">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{delayedCount}</span>
              <span className="kpi-label">Delayed</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-pill warning">
              ↑ +50% <span className="kpi-trend-context">vs last month</span>
            </span>
            <svg className="kpi-sparkline" viewBox="0 0 60 20" fill="none">
              <path d="M2 14 C 20 18, 38 6, 58 12" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* 3. Main Split View: Left (Register) & Right (Widgets) */}
      <div className="orders-main-split">
        {/* Left Column: Order Register Table */}
        <section className="order-register-panel">
          <div className="order-register-header">
            <h2 className="order-register-title">Order register</h2>
            <span className="order-register-updated">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="order-filters-bar">
            <Input.Search
              key={q}
              className="order-search-input"
              aria-label="Search orders"
              placeholder="Search order ID, buyer or fabric..."
              defaultValue={q}
              onSearch={value => update({ q: value })}
              allowClear
            />

            <Select
              className="order-status-select"
              aria-label="Filter by order status"
              value={status}
              onChange={value => update({ status: value })}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'draft', label: 'Draft' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'in_production', label: 'In Production' },
                { value: 'ready_to_ship', label: 'Ready to Dispatch' },
                { value: 'dispatched', label: 'Dispatched' },
                { value: 'delivered', label: 'Delivered' },
              ]}
            />

            <Select
              className="order-priority-select"
              aria-label="Filter by order priority"
              value={priority}
              onChange={value => update({ priority: value })}
              options={[
                { value: '', label: 'All priorities' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />

            <Button
              className="btn-table-refresh"
              onClick={() => query.refetch()}
              loading={query.isFetching}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Refresh
            </Button>
          </div>

          <QueryState query={query}>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={rows}
              locale={{
                emptyText: (
                  <NoData description="No orders match this view. Create an order to get started." />
                ),
              }}
              scroll={{ x: 800 }}
              pagination={{
                current: page,
                pageSize: 25,
                total: totalCount,
                showSizeChanger: false,
                onChange: value => update({ page: String(value) }),
              }}
            />
          </QueryState>
        </section>

        {/* Right Column: Today's Dispatch, Order Health, Attention Needed */}
        <aside className="orders-widgets-column">
          {/* Widget 1: Today's Dispatch */}
          <div className="orders-widget-card">
            <div className="widget-card-header">
              <h3 className="widget-card-title">Today&apos;s dispatch</h3>
              <Link to="/app/orders" className="widget-view-all-link">
                View all →
              </Link>
            </div>

            <div className="dispatch-summary-strip">
              <div className="dispatch-stat-col">
                <span className="dispatch-stat-num">{dispatchCandidates.length}</span>
                <span className="dispatch-stat-lbl">Orders scheduled</span>
              </div>
              <div className="dispatch-stat-col">
                <span className="dispatch-stat-num">
                  {quantity(dispatchQuantity)} m
                </span>
                <span className="dispatch-stat-lbl">Total quantity</span>
              </div>
            </div>

            <div className="dispatch-items-list">
              {dispatchCandidates.length > 0 ? (
                dispatchCandidates.slice(0, 3).map(order => (
                  <Link
                    key={order.id}
                    to={`/app/orders/${order.id}`}
                    className="dispatch-item-card"
                  >
                    <div className="dispatch-truck-icon">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="3" width="15" height="13" />
                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                        <circle cx="5.5" cy="18.5" r="2.5" />
                        <circle cx="18.5" cy="18.5" r="2.5" />
                      </svg>
                    </div>
                    <div className="dispatch-item-mid">
                      <div className="dispatch-item-ord-no">{order.order_no}</div>
                      <div className="dispatch-item-buyer">{order.buyer_name || 'Buyer'}</div>
                    </div>
                    <div className="dispatch-item-right">
                      <div className="dispatch-item-qty">{quantity(order.total_qty)} m</div>
                      <div className="dispatch-item-fabric">{order.fabric_name || 'Fabric'}</div>
                    </div>
                    <span className="dispatch-chevron-icon">›</span>
                  </Link>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '14px 0', color: '#9ca3af', fontSize: '12.5px' }}>
                  No dispatches scheduled for today
                </div>
              )}
            </div>
          </div>

          {/* Widget 2: Order Health Donut */}
          <div className="orders-widget-card">
            <div className="widget-card-header">
              <h3 className="widget-card-title">Order health</h3>
              <Link to="/app/orders" className="widget-view-all-link">
                View all →
              </Link>
            </div>

            <div className="order-health-body">
              <div className="donut-chart-wrapper">
                <svg className="donut-chart-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                  {/* On track arc (green) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="12"
                    strokeDasharray={`${strokeOnTrack} ${circ}`}
                    strokeDashoffset="0"
                  />
                  {/* At risk arc (amber) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="12"
                    strokeDasharray={`${strokeAtRisk} ${circ}`}
                    strokeDashoffset={-strokeOnTrack}
                  />
                  {/* Delayed arc (red) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="12"
                    strokeDasharray={`${strokeDelayed} ${circ}`}
                    strokeDashoffset={-(strokeOnTrack + strokeAtRisk)}
                  />
                </svg>
                <div className="donut-center-text">
                  <span className="donut-center-num">{totalCount}</span>
                  <span className="donut-center-lbl">Total orders</span>
                </div>
              </div>

              <div className="health-legend-list">
                <div className="health-legend-row">
                  <span className="health-legend-label">
                    <span className="dot green" /> On track
                  </span>
                  <div className="health-legend-nums">
                    <span className="health-legend-count">{healthOnTrack}</span>
                    <span className="health-legend-pct">{pctOnTrack}%</span>
                  </div>
                </div>

                <div className="health-legend-row">
                  <span className="health-legend-label">
                    <span className="dot amber" /> At risk
                  </span>
                  <div className="health-legend-nums">
                    <span className="health-legend-count">{healthAtRisk}</span>
                    <span className="health-legend-pct">{pctAtRisk}%</span>
                  </div>
                </div>

                <div className="health-legend-row">
                  <span className="health-legend-label">
                    <span className="dot red" /> Delayed
                  </span>
                  <div className="health-legend-nums">
                    <span className="health-legend-count">{healthDelayed}</span>
                    <span className="health-legend-pct">{pctDelayed}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Widget 3: Attention Needed Banner */}
          <div className="orders-widget-card attention-widget-card">
            <div className="widget-card-header" style={{ marginBottom: 4 }}>
              <div className="attention-widget-head">
                <span className="attention-icon-bulb">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                  </svg>
                </span>
                <h4 className="attention-widget-title">Attention needed</h4>
              </div>
              <Link to="/app/orders?status=delayed" className="widget-view-all-link" style={{ color: '#92400e' }}>
                View all →
              </Link>
            </div>
            <p className="attention-widget-text">
              {delayedCount > 0
                ? `${delayedCount} order${delayedCount > 1 ? 's are' : ' is'} delayed. Review and take action to keep deliveries on track.`
                : 'All active commitments are currently on track. No immediate action required.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
