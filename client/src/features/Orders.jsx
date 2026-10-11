// Orders page: KPI cards, the filterable order register and the side widgets.
// The table and filters talk to GET /orders; the cards use GET /orders/summary.
import { Button, Dropdown, Input, Select, Table } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { NoData, QueryState } from '@/components/States';
import { KpiRow, OrderWidgets } from '@/components/OrderSummary';
import { useGet } from '@/lib/hooks';
import { date, quantity } from '@/lib/format';
import '@/styles/orders.css';
import { usePageTitle } from '@/lib/title';

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

// the screen's priority names -> the server's ("medium" is stored as "normal", "high" includes "urgent")
const BUCKET_LABEL = { open: 'open orders', in_production: 'in production', ready_to_dispatch: 'ready to dispatch', delayed: 'delayed orders' };
const PRIORITY_FILTER = { high: 'high,urgent', medium: 'normal', low: 'low' };

export default function Orders() {
  usePageTitle('Orders');
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = params.get('status') || '';
  const priority = params.get('priority') || '';
  const q = params.get('q') || '';

  const bucket = params.get('bucket') || '';
  const query = useGet('/orders', { page, limit: 25, status, bucket, q, priority: PRIORITY_FILTER[priority] }, { refetchInterval: 30000 });
  const summaryQuery = useGet('/orders/summary', {}, { refetchInterval: 30000 });
  const summary = summaryQuery.payload;

  function update(values) {
    setParams({ q, status, priority, bucket, page: '1', ...values }, {});
  }

  const rows = query.payload || [];
  const totalCount = query.meta?.total ?? rows.length;

  const columns = [
    {
      title: 'Order ID',
      dataIndex: 'order_no',
      sorter: (a, b) => (a.order_no || '').localeCompare(b.order_no || ''),
      render: (value, row) => (
        <Link className="order-id-link" to={`/app/orders/${row.id}`}>
          {value}
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
          <span className="buyer-name-text">{value}</span>
        </div>
      ),
    },
    {
      title: 'Fabric',
      dataIndex: 'fabric_name',
      render: (value, row) => (
        <div className="fabric-cell-wrapper">
          <span className="fabric-title-text">{value}</span>
          <span className="fabric-spec-text">
            {[row.fabric_colour, row.buyer_ref && `Ref ${row.buyer_ref}`].filter(Boolean).join(' · ')}
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
          {quantity(value)} {row.uom}
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

      {/* 2. KPI summary cards (counts over all orders) */}
      {summary && <KpiRow summary={summary} />}

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
              Updated {query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…'}
            </span>
          </div>

          {bucket && (
            <div className="order-bucket-chip">
              Showing: {BUCKET_LABEL[bucket]}
              <button type="button" onClick={() => update({ bucket: '' })} aria-label="Clear this filter">×</button>
            </div>
          )}

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
              scroll={{ x: 720 }}
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

        {/* Right Column: today's dispatch, order health, attention needed */}
        {summary && <OrderWidgets summary={summary} />}
      </div>
    </div>
  );
}
