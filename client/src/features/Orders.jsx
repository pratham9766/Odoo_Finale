import { useQuery } from '@tanstack/react-query';
import { Button, Dropdown, Input, Select, Table } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '@/components/Icons';
import { useSession } from '@/context/Session';
import { NoData, PageTitle, QueryState } from '@/components/States';
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

  const query = useQuery({
    queryKey: [session.userId, 'orders', page, status, q, priority],
    queryFn: ({ signal }) => {
      const searchParams = new URLSearchParams({ page: String(page), limit: '25' });
      if (status) searchParams.set('status', status);
      if (q) searchParams.set('q', q);
      if (priority) searchParams.set('priority', priority === 'medium' ? 'normal' : priority);
      return session.api(`/orders?${searchParams}`, { signal });
    },
    refetchInterval: 60000,
  });

  function update(values) {
    const next = { q, status, priority, page: '1', ...values };
    setParams(next);
  }

  const rows = query.data?.data || [];
  const totalCount = query.data?.meta?.total ?? rows.length;

  /* Cards and health ring: counted by the server across every order, not just this page */
  const summaryQuery = useQuery({
    queryKey: [session.userId, 'orders', 'summary'],
    queryFn: ({ signal }) => session.api('/orders/summary', { signal }),
    refetchInterval: 60000,
  });
  const summary = summaryQuery.data?.data || {};
  const openOrdersCount = summary.open ?? 0;
  const inProductionCount = summary.in_production ?? 0;
  const readyToDispatchCount = summary.ready_to_dispatch ?? 0;
  const delayedCount = summary.delayed ?? 0;

  /* Ready to dispatch: the first few, across all orders */
  const readyQuery = useQuery({
    queryKey: [session.userId, 'orders', 'ready'],
    queryFn: ({ signal }) => session.api('/orders?page=1&limit=3&status=ready_to_ship,partially_dispatched', { signal }),
    refetchInterval: 60000,
  });
  const dispatchCandidates = readyQuery.data?.data || [];
  const dispatchQuantity = summary.ready_qty ?? 0;

  /* Order health (active orders: not delivered or cancelled) */
  const activeCount = summary.active ?? 0;
  const totalForHealth = activeCount || 1;
  const healthDelayed = delayedCount;
  const healthAtRisk = summary.at_risk ?? 0;
  const healthOnTrack = summary.on_track ?? 0;

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
      {/* 1. Page Header (title goes to the top bar) */}
      <PageTitle
        title="Orders"
        description="Keep every commitment in view, from confirmation to dispatch."
        action={session.can('orders.create') && (
          <Link to="/app/orders/new">
            <Button type="primary" size="large" className="btn-create-order-primary">
              + Create order
            </Button>
          </Link>
        )}
      />

      {/* 2. Top 4 KPI Summary Cards */}
      <section className="kpi-summary-row" aria-label="Orders Summary Metrics">
        {/* Card 1: Open Orders */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square green">
              <Icon name="orders" size={22} strokeWidth={2} />
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{openOrdersCount}</span>
              <span className="kpi-label">Open Orders</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-context">Draft, confirmed or waiting for material</span>
          </div>
        </div>

        {/* Card 2: In Production */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square amber">
              <Icon name="loom" size={22} strokeWidth={2} />
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{inProductionCount}</span>
              <span className="kpi-label">In Production</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-context">Being spun, woven, dyed or checked</span>
          </div>
        </div>

        {/* Card 3: Ready to Dispatch */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square emerald">
              <Icon name="truck" size={22} strokeWidth={2} />
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{readyToDispatchCount}</span>
              <span className="kpi-label">Ready to Dispatch</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-context">Packed and ready for the truck</span>
          </div>
        </div>

        {/* Card 4: Delayed */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon-square red">
              <Icon name="alert" size={22} strokeWidth={2} />
            </div>
            <div className="kpi-numbers-wrap">
              <span className="kpi-value">{delayedCount}</span>
              <span className="kpi-label">Delayed</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <span className="kpi-trend-context">Past the deadline or flagged red</span>
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
              <Icon name="clock" size={13} strokeWidth={2} />
              Updated {new Date(Math.max(query.dataUpdatedAt, summaryQuery.dataUpdatedAt) || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              <Icon name="refresh" size={13} strokeWidth={2} />
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
                <span className="dispatch-stat-num">{readyToDispatchCount}</span>
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
                      <Icon name="truck" size={17} strokeWidth={2} />
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
                <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--text-muted)', fontSize: '12.5px' }}>
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
                  <circle cx="50" cy="50" r="38" fill="none" style={{ stroke: "var(--c-pink-light)" }} strokeWidth="12" />
                  {/* On track arc (green) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    style={{ stroke: "var(--ok)" }}
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
                    style={{ stroke: "var(--risk)" }}
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
                    style={{ stroke: "var(--danger)" }}
                    strokeWidth="12"
                    strokeDasharray={`${strokeDelayed} ${circ}`}
                    strokeDashoffset={-(strokeOnTrack + strokeAtRisk)}
                  />
                </svg>
                <div className="donut-center-text">
                  <span className="donut-center-num">{activeCount}</span>
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
                  <Icon name="warning" size={18} strokeWidth={2} />
                </span>
                <h4 className="attention-widget-title">Attention needed</h4>
              </div>
              <Link to="/app/orders?status=delayed" className="widget-view-all-link" style={{ color: 'var(--risk)' }}>
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
