import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, Tag, Button, Input, Select, Drawer, Descriptions, Progress, Alert, Typography, Tabs } from 'antd';
import {
  SearchOutlined, PlusOutlined, FilterOutlined,
  WarningOutlined, ReloadOutlined, ArrowUpOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { useUrlState } from '@/hooks/useUrlState';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/useIsMobile';
import { P } from '@/lib/permissions';
import { PageHeader, SectionCard, KpiCard, Can } from '@/components/common';
import { fetchStock } from '../api';
import { STOCK } from '@/mocks/fixtures';
import { formatQty } from '@/lib/format';

const { Text } = Typography;

const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  { value: 'yarn', label: 'Yarn' },
  { value: 'fibre', label: 'Fibre' },
  { value: 'dye', label: 'Dye & chemicals' },
  { value: 'finished_fabric', label: 'Finished fabric' },
];

function StockStatus({ item }) {
  if (item.available <= 0) return <Tag color="error">Out of stock</Tag>;
  if (item.available <= item.reorder_level) return <Tag color="warning">Low stock</Tag>;
  return <Tag color="success">OK</Tag>;
}

export default function StockPage() {
  const { orgId } = useOrg();
  const { can } = usePermission();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlState({ kind: '', search: '' });
  const [drawerItem, setDrawerItem] = useState(null);
  const debouncedSearch = useDebounce(filters.search, 300);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', 'stock', orgId, filters.kind, debouncedSearch],
    queryFn: ({ signal }) => fetchStock({ orgId, kind: filters.kind || null, search: debouncedSearch, signal }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const items = data?.data ?? [];

  // KPIs from data
  const lowStockItems = items.filter(i => i.available <= i.reorder_level && i.reorder_level > 0);
  const outOfStock = items.filter(i => i.available <= 0);
  const totalKinds = [...new Set(items.map(i => i.kind))].length;

  const columns = [
    {
      title: 'Item',
      key: 'item',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#12233F' }}>{r.item_name}</div>
          {r.colour && <div style={{ fontSize: 12, color: '#536278' }}>{r.colour}</div>}
        </div>
      ),
    },
    {
      title: 'Kind',
      dataIndex: 'kind',
      key: 'kind',
      render: v => <Tag>{v?.replace('_', ' ')}</Tag>,
      responsive: ['sm'],
    },
    {
      title: 'On hand',
      dataIndex: 'on_hand',
      key: 'on_hand',
      render: (v, r) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatQty(v, r.uom)}</span>,
      align: 'right',
      width: 110,
    },
    {
      title: 'Reserved',
      dataIndex: 'reserved',
      key: 'reserved',
      render: (v, r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: '#536278' }}>{formatQty(v, r.uom)}</span>,
      align: 'right',
      width: 110,
      responsive: ['md'],
    },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      render: (v, r) => (
        <span style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
          color: v <= 0 ? '#B42318' : v <= r.reorder_level ? '#925400' : '#18794E',
        }}>
          {formatQty(v, r.uom)}
        </span>
      ),
      align: 'right',
      width: 120,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => <StockStatus item={r} />,
      width: 120,
      responsive: ['sm'],
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Button size="small" onClick={() => setDrawerItem(r)}>Details</Button>
      ),
      width: 80,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Raw materials, yarn and finished fabric inventory"
        actions={[
          can(P.RECEIPT_CREATE) && (
            <Button key="grn" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/inventory/receipts/new')}>
              New GRN
            </Button>
          ),
          can(P.RECEIPT_CREATE) && (
            <Button key="receipts" onClick={() => navigate('/app/inventory/receipts')}>
              View receipts
            </Button>
          ),
        ].filter(Boolean)}
      />

      {/* KPI row */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <KpiCard label="Total items" value={items.length} status="info" loading={isLoading} />
        <KpiCard label="Low stock" value={lowStockItems.length} status={lowStockItems.length > 0 ? 'warn' : 'ok'} loading={isLoading} />
        <KpiCard label="Out of stock" value={outOfStock.length} status={outOfStock.length > 0 ? 'bad' : 'ok'} loading={isLoading} />
        <KpiCard label="Material kinds" value={totalKinds} status="muted" loading={isLoading} />
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={`${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} below reorder level`}
          description={lowStockItems.map(i => `${i.item_name} ${i.colour ? `(${i.colour})` : ''} — ${formatQty(i.available, i.uom)} available`).join(' · ')}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          prefix={<SearchOutlined style={{ color: '#536278' }} />}
          placeholder="Search item, colour…"
          value={filters.search}
          onChange={e => setFilters({ search: e.target.value })}
          style={{ maxWidth: 260 }}
          allowClear
        />
        <Select
          value={filters.kind}
          onChange={v => setFilters({ kind: v })}
          style={{ width: 180 }}
          options={KIND_OPTIONS}
        />
        <Button icon={<ReloadOutlined />} onClick={refetch}>Refresh</Button>
      </div>

      {/* Table */}
      <div className="tl-table-container">
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 25, showTotal: (t, [s, e]) => `${s}–${e} of ${t}` }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
          onRow={r => ({
            style: { cursor: 'pointer' },
            onClick: () => setDrawerItem(r),
          })}
        />
      </div>

      {/* Item detail drawer */}
      <Drawer
        title={drawerItem ? `${drawerItem.item_name}${drawerItem.colour ? ` · ${drawerItem.colour}` : ''}` : ''}
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        width={420}
        placement="left"
      >
        {drawerItem && (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: 'On hand',        value: formatQty(drawerItem.on_hand, drawerItem.uom),    bold: true },
                { label: 'Reserved',       value: formatQty(drawerItem.reserved, drawerItem.uom) },
                { label: 'Available',      value: formatQty(drawerItem.available, drawerItem.uom),  bold: true,
                  color: drawerItem.available <= 0 ? '#B42318' : drawerItem.available <= drawerItem.reorder_level ? '#925400' : '#18794E' },
                { label: 'Reorder level',  value: formatQty(drawerItem.reorder_level, drawerItem.uom) },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 12, color: '#536278', marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 16, fontWeight: f.bold ? 700 : 400, color: f.color ?? '#12233F', fontVariantNumeric: 'tabular-nums' }}>
                    {f.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: '#F4F6F8', borderRadius: 6, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#536278', marginBottom: 6 }}>Stock level</div>
              <Progress
                percent={drawerItem.reorder_level > 0
                  ? Math.min(100, Math.round((drawerItem.available / (drawerItem.reorder_level * 2)) * 100))
                  : 100}
                strokeColor={drawerItem.available <= 0 ? '#B42318' : drawerItem.available <= drawerItem.reorder_level ? '#F08C00' : '#18794E'}
                showInfo={false}
              />
            </div>

            <StockStatus item={drawerItem} />

            {drawerItem.available <= drawerItem.reorder_level && drawerItem.reorder_level > 0 && (
              <Alert
                className="mt-3"
                type="warning"
                message="Low stock — consider raising a purchase order"
                action={
                  can(P.PO_CREATE) && (
                    <Button size="small" type="primary">Create PO</Button>
                  )
                }
              />
            )}

            <div style={{ marginTop: 16, fontSize: 13, color: '#536278' }}>
              Lot breakdown, movement history and lot-level traceability will appear here when backend is connected.
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
