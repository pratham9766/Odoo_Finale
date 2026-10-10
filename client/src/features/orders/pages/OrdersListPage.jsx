import { useState } from 'react';
import { Table, Input, Select, Button, Tag, Space, Drawer, Form } from 'antd';
import { SearchOutlined, PlusOutlined, FilterOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useOrders } from '../queries';
import { useUrlState } from '@/hooks/useUrlState';
import { usePermission } from '@/hooks/usePermission';
import { useIsMobile } from '@/hooks/useIsMobile';
import { P } from '@/lib/permissions';
import { PageHeader, StatusBadge, RiskChip, DateText, MoneyText } from '@/components/common';
import { useDebounce } from '@/hooks/useDebounce';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'waiting_material', label: 'Waiting material' },
  { value: 'in_production', label: 'In production' },
  { value: 'ready_to_ship', label: 'Ready to ship' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
];

export default function OrdersListPage() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const isMobile = useIsMobile();
  const [filters, setFilters] = useUrlState({ status: 'all', search: '', page: 1, pageSize: 20 });
  const [filterDrawer, setFilterDrawer] = useState(false);
  const debouncedSearch = useDebounce(filters.search, 300);

  const { data, isLoading, isError, refetch } = useOrders();

  const orders = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const columns = [
    {
      title: 'Order no.',
      dataIndex: 'order_no',
      key: 'order_no',
      render: (v, r) => <Link to={`/app/orders/${r.id}`} style={{ fontWeight: 600 }}>{v}</Link>,
      width: 160,
    },
    {
      title: 'Buyer',
      dataIndex: 'buyer_name',
      key: 'buyer_name',
      ellipsis: true,
      responsive: ['sm'],
    },
    {
      title: 'Item · Colour',
      key: 'item',
      render: (_, r) => (
        <span>{r.lines?.[0]?.item_name} · {r.lines?.[0]?.colour}</span>
      ),
      responsive: ['md'],
    },
    {
      title: 'Qty',
      key: 'qty',
      render: (_, r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {r.ordered_qty?.toLocaleString('en-IN')} {r.lines?.[0]?.uom}
        </span>
      ),
      align: 'right',
      width: 110,
    },
    {
      title: 'Deadline',
      dataIndex: 'deadline',
      key: 'deadline',
      render: (v) => <DateText value={v} />,
      width: 130,
      responsive: ['sm'],
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <StatusBadge status={v} />,
      width: 160,
    },
    {
      title: 'Risk',
      dataIndex: 'risk',
      key: 'risk',
      render: (v) => <RiskChip risk={v} />,
      width: 110,
      responsive: ['md'],
    },
    ...(can(P.ORDERS_VIEW_PRICE) ? [{
      title: 'Rate',
      key: 'rate',
      render: (_, r) => <MoneyText value={r.lines?.[0]?.rate} />,
      align: 'right',
      width: 100,
      responsive: ['lg'],
    }] : []),
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Button size="small" onClick={() => navigate(`/app/orders/${r.id}`)}>Open</Button>
      ),
      width: 70,
    },
  ];

  // Mobile card view
  const MobileCard = ({ order }) => (
    <div
      style={{ background: '#fff', border: '1px solid #DCE3E9', borderRadius: 8, padding: 16, marginBottom: 8, cursor: 'pointer' }}
      onClick={() => navigate(`/app/orders/${order.id}`)}
      role="button"
      tabIndex={0}
    >
      <div className="flex justify-between items-start">
        <span style={{ fontWeight: 600, fontSize: 15 }}>{order.order_no}</span>
        <StatusBadge status={order.status} />
      </div>
      <div style={{ fontSize: 13, color: '#536278', marginTop: 4 }}>{order.buyer_name}</div>
      <div style={{ fontSize: 13, color: '#536278', marginTop: 2 }}>
        {order.lines?.[0]?.item_name} · {order.ordered_qty?.toLocaleString('en-IN')} {order.lines?.[0]?.uom}
      </div>
      <div className="flex gap-2 mt-3">
        <RiskChip risk={order.risk} />
        {order.deadline && <Tag>Due <DateText value={order.deadline} /></Tag>}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Orders"
        actions={[
          can(P.ORDERS_CREATE) && (
            <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/orders/new')}>
              New order
            </Button>
          ),
        ].filter(Boolean)}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          prefix={<SearchOutlined style={{ color: '#536278' }} />}
          placeholder="Search order no., buyer, item…"
          value={filters.search}
          onChange={e => setFilters({ search: e.target.value, page: 1 })}
          style={{ maxWidth: 280 }}
          allowClear
        />
        {!isMobile ? (
          <Select
            value={filters.status}
            onChange={v => setFilters({ status: v, page: 1 })}
            style={{ width: 180 }}
            options={STATUS_TABS.map(t => ({ value: t.value, label: t.label }))}
          />
        ) : (
          <Button icon={<FilterOutlined />} onClick={() => setFilterDrawer(true)}>
            Filters {filters.status !== 'all' ? `(1)` : ''}
          </Button>
        )}

        {/* Active filter chips */}
        {filters.status !== 'all' && (
          <Tag closable onClose={() => setFilters({ status: 'all' })}>
            Status: {STATUS_TABS.find(t => t.value === filters.status)?.label}
          </Tag>
        )}
        {filters.search && (
          <Tag closable onClose={() => setFilters({ search: '' })}>
            Search: {filters.search}
          </Tag>
        )}
      </div>

      {/* Mobile cards */}
      {isMobile ? (
        <div>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid #DCE3E9', borderRadius: 8, padding: 16, marginBottom: 8, height: 80 }} />
              ))
            : orders.map(o => <MobileCard key={o.id} order={o} />)
          }
        </div>
      ) : (
        // Desktop table
        <div className="tl-table-container">
          <Table
            dataSource={orders}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="middle"
            scroll={{ x: 'max-content' }}
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t, [s, e]) => `${s}–${e} of ${t} orders`,
              onChange: (p, ps) => setFilters({ page: p, pageSize: ps }),
            }}
            style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
            onRow={r => ({
              style: { cursor: 'pointer' },
              onKeyDown: e => e.key === 'Enter' && navigate(`/app/orders/${r.id}`),
            })}
          />
        </div>
      )}

      {/* Mobile filter drawer */}
      <Drawer
        title="Filter orders"
        open={filterDrawer}
        onClose={() => setFilterDrawer(false)}
        placement="left"
        height={280}
      >
        <Form layout="vertical">
          <Form.Item label="Status">
            <Select
              value={filters.status}
              onChange={v => { setFilters({ status: v, page: 1 }); setFilterDrawer(false); }}
              style={{ width: '100%' }}
              options={STATUS_TABS.map(t => ({ value: t.value, label: t.label }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
