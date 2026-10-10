import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Tabs, Button, Row, Col, Descriptions, Tag, Alert, Table, Progress, Space, message, Skeleton, Drawer } from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, LockOutlined, FileTextOutlined,
  CarOutlined, PrinterOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { useWatchOrder } from '@/hooks/useSocketEvent';
import { P } from '@/lib/permissions';
import { PageHeader, SectionCard, StatusBadge, RiskChip, Can, DateText, MoneyText, QtyText, ConfirmButton } from '@/components/common';
import { useOrder, useOrderRequirements, useConfirmOrder, useReserveMaterial, useCancelOrder } from '../queries';
import { fetchOrderRequirements } from '../api';
import { formatDate, formatDateTime } from '@/lib/format';

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading, isError, refetch } = useOrder(id);
  const order = data?.data;

  // Watch this order room for realtime updates
  useWatchOrder(id);

  const confirmMutation = useConfirmOrder();
  const reserveMutation = useReserveMaterial();
  const cancelMutation = useCancelOrder();

  if (isLoading) {
    return (
      <div>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <Alert
        type="error"
        message="Order not found"
        description={`Could not load order ${id}. It may have been deleted or you may not have access.`}
        action={<Button onClick={() => navigate('/app/orders')}>Back to orders</Button>}
      />
    );
  }

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: <OverviewTab order={order} can={can} />,
    },
    {
      key: 'requirements',
      label: 'Requirements',
      children: <RequirementsTab orderId={id} can={can} />,
    },
    {
      key: 'rolls',
      label: `Rolls (${order.rolls?.length ?? 0})`,
      children: <RollsTab rolls={order.rolls ?? []} />,
    },
    {
      key: 'dispatches',
      label: `Dispatches (${order.dispatches?.length ?? 0})`,
      children: <DispatchesTab dispatches={order.dispatches ?? []} />,
    },
    ...(can(P.INVOICE_VIEW) ? [{
      key: 'invoices',
      label: 'Invoices',
      children: <InvoicesTab invoices={order.invoices ?? []} />,
    }] : []),
    {
      key: 'timeline',
      label: 'Timeline',
      children: <TimelineTab order={order} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title={order.order_no}
        breadcrumbs={[
          { title: <Link to="/app/orders">Orders</Link> },
          { title: order.order_no },
        ]}
        subtitle={`${order.buyer_name} · ${order.lines?.[0]?.item_name} · ${order.lines?.[0]?.colour}`}
        actions={[
          can(P.ORDERS_CANCEL) && order.status === 'draft' && (
            <ConfirmButton
              key="cancel"
              title={`Cancel order ${order.order_no}?`}
              description="This action cannot be undone. Active production will be halted."
              danger
              onConfirm={() => cancelMutation.mutate({ id, reason: 'User cancelled' })}
              loading={cancelMutation.isPending}
            >
              Cancel order
            </ConfirmButton>
          ),
          can(P.ORDERS_CREATE) && order.status === 'draft' && (
            <Button
              key="confirm"
              type="primary"
              icon={<CheckOutlined />}
              loading={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(id, {
                onSuccess: () => message.success('Order confirmed'),
                onError: (e) => message.error(e.message),
              })}
            >
              Confirm order
            </Button>
          ),
        ].filter(Boolean)}
      />

      {/* Header card */}
      <SectionCard className="mb-4">
        <Row gutter={[24, 16]}>
          <Col xs={24} md={16}>
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
              <Descriptions.Item label="Status">
                {/* Status derived from server — not editable dropdown */}
                <StatusBadge status={order.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Risk">
                <RiskChip risk={order.risk} />
              </Descriptions.Item>
              <Descriptions.Item label="Priority">
                <Tag color={order.priority === 'urgent' ? 'red' : order.priority === 'high' ? 'orange' : 'default'}>
                  {order.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Order date">
                <DateText value={order.order_date} />
              </Descriptions.Item>
              <Descriptions.Item label="Deadline">
                <DateText value={order.deadline} />
              </Descriptions.Item>
              <Descriptions.Item label="Expected completion">
                {order.expected_completion ? <DateText value={order.expected_completion} /> : 'Not estimated'}
              </Descriptions.Item>
              <Descriptions.Item label="Buyer">
                {order.buyer_name}
              </Descriptions.Item>
              <Descriptions.Item label="Current stage">
                {order.current_stage ?? '—'}
              </Descriptions.Item>
              {can(P.ORDERS_VIEW_PRICE) && (
                <Descriptions.Item label="Rate">
                  <MoneyText value={order.lines?.[0]?.rate} />
                  <span style={{ fontSize: 12, color: '#536278' }}> / {order.lines?.[0]?.uom}</span>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Col>

          <Col xs={24} md={8}>
            {/* Quantity summary */}
            <div style={{ background: '#F8F9FA', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#12233F', marginBottom: 12 }}>Quantities ({order.lines?.[0]?.uom})</div>
              {[
                { label: 'Ordered',            value: order.ordered_qty },
                { label: 'Final output produced', value: order.produced_qty },
                { label: 'QC approved',        value: order.qc_approved_qty,  color: '#18794E' },
                { label: 'Already dispatched', value: order.dispatched_qty,   color: '#006B73' },
                { label: 'Remaining ready',    value: order.remaining_qty,    bold: true },
              ].map(row => (
                <div key={row.label} className="flex justify-between mb-2">
                  <span style={{ fontSize: 13, color: '#536278' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: row.bold ? 700 : 400, color: row.color ?? '#12233F', fontVariantNumeric: 'tabular-nums' }}>
                    <QtyText value={row.value} uom={row.value != null ? '' : undefined} />
                  </span>
                </div>
              ))}

              <div style={{ marginTop: 12 }}>
                <Progress
                  percent={order.progress_pct}
                  strokeColor="#006B73"
                  trailColor="#DCE3E9"
                  size="small"
                  format={p => `${p}% produced`}
                />
              </div>
            </div>
          </Col>
        </Row>
      </SectionCard>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}

function OverviewTab({ order, can }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <SectionCard title="Order lines">
          <Table
            dataSource={order.lines ?? []}
            rowKey="item_name"
            size="small"
            pagination={false}
            columns={[
              { title: 'Item', dataIndex: 'item_name', key: 'item_name' },
              { title: 'Colour', dataIndex: 'colour', key: 'colour' },
              { title: 'Qty', dataIndex: 'qty', key: 'qty', render: (v, r) => <QtyText value={v} uom={r.uom} />, align: 'right' },
              ...(can(P.ORDERS_VIEW_PRICE) ? [{ title: 'Rate (₹)', dataIndex: 'rate', key: 'rate', render: v => <MoneyText value={v} />, align: 'right' }] : []),
            ]}
          />
        </SectionCard>
      </Col>
      <Col xs={24} lg={8}>
        <SectionCard title="Next action">
          <div style={{ fontSize: 14, color: '#536278', lineHeight: 1.6 }}>
            {order.status === 'draft' && 'Confirm the order to begin material reservation.'}
            {order.status === 'confirmed' && 'Reserve material to allow production planning.'}
            {order.status === 'waiting_material' && 'Material shortage — raise a purchase order for shortfall.'}
            {order.status === 'material_ready' && 'Material reserved — plan production and assign work orders.'}
            {order.status === 'in_production' && 'Production in progress — monitor machine board and QC queue.'}
            {order.status === 'in_qc' && 'Quality check in progress — review QC queue for pending rolls.'}
            {order.status === 'ready_to_ship' && 'QC complete — create a dispatch and scan rolls.'}
            {order.status === 'partially_dispatched' && 'Partial dispatch done — remaining approved rolls can be dispatched.'}
            {order.status === 'dispatched' && 'All rolls dispatched — generate invoice.'}
            {order.status === 'delivered' && 'Delivered and closed.'}
          </div>
        </SectionCard>
      </Col>
    </Row>
  );
}

function RequirementsTab({ orderId, can }) {
  const { data, isLoading } = useQuery({
    queryKey: ['orders', orderId, 'requirements'],
    queryFn: ({ signal }) => fetchOrderRequirements({ id: orderId, signal }),
    enabled: !!orderId,
  });

  const requirements = data?.data ?? [];

  const columns = [
    { title: 'Material', dataIndex: 'item_name', key: 'item_name' },
    { title: 'Need (kg)', dataIndex: 'gross_need', key: 'gross_need', render: v => <QtyText value={v} uom="kg" />, align: 'right' },
    { title: 'On hand', dataIndex: 'on_hand', key: 'on_hand', render: v => <QtyText value={v} uom="kg" />, align: 'right' },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', render: v => <QtyText value={v} uom="kg" />, align: 'right' },
    { title: 'Available', dataIndex: 'available', key: 'available', render: v => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: v < 0 ? '#B42318' : '#18794E' }}>{v} kg</span>, align: 'right' },
    { title: 'Shortage', key: 'shortage', render: (_, r) => r.shortage > 0 ? <Tag color="error">{r.shortage} kg short</Tag> : <Tag color="success">OK</Tag> },
  ];

  return (
    <div>
      {requirements.some(r => r.shortage > 0) && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message="Material shortage detected"
          description={`${requirements.filter(r => r.shortage > 0).length} item(s) have insufficient available stock. Raise a purchase order before confirming production.`}
        />
      )}
      <div className="tl-table-container">
        <Table
          dataSource={requirements}
          columns={columns}
          rowKey="item_name"
          loading={isLoading}
          size="middle"
          pagination={false}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: '#536278' }}>
        Available = on hand − reserved for other orders. Shortage = gross need − available.
        Reservation is not deducted until confirmed by backend.
      </div>
    </div>
  );
}

function RollsTab({ rolls }) {
  const columns = [
    { title: 'Roll no.', dataIndex: 'roll_no', key: 'roll_no', render: v => <Link to={`/app/rolls/${encodeURIComponent(v)}`}>{v}</Link> },
    { title: 'Length', dataIndex: 'length_m', key: 'length_m', render: v => <QtyText value={v} uom="m" />, align: 'right', width: 90 },
    { title: 'Weight', dataIndex: 'weight_kg', key: 'weight_kg', render: v => <QtyText value={v} uom="kg" />, align: 'right', width: 90, responsive: ['md'] },
    { title: 'Dye batch', dataIndex: 'dye_batch', key: 'dye_batch', responsive: ['sm'] },
    { title: 'Machine', dataIndex: 'machine_code', key: 'machine_code', responsive: ['md'] },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <StatusBadge status={v} /> },
  ];

  return (
    <div className="tl-table-container">
      <Table
        dataSource={rolls}
        columns={columns}
        rowKey="id"
        size="middle"
        pagination={{ pageSize: 20 }}
        style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
      />
    </div>
  );
}

function DispatchesTab({ dispatches }) {
  if (dispatches.length === 0) {
    return <div style={{ padding: 24, color: '#536278' }}>No dispatches yet for this order.</div>;
  }
  return (
    <div className="space-y-3">
      {dispatches.map(d => (
        <SectionCard key={d.id}>
          <div className="flex justify-between flex-wrap gap-2">
            <div>
              <span style={{ fontWeight: 600 }}>{d.dispatch_no}</span>
              <StatusBadge status={d.status} />
            </div>
            <Link to={`/app/dispatch/${d.id}`}>
              <Button size="small">View dispatch</Button>
            </Link>
          </div>
          <div style={{ fontSize: 13, color: '#536278', marginTop: 8 }}>
            {d.total_length_m} m · {d.rolls_count} rolls · {d.vehicle_no ?? 'Vehicle TBD'}
          </div>
          {d.confirmed_at && <div style={{ fontSize: 12, color: '#536278' }}>Confirmed: {formatDateTime(d.confirmed_at)}</div>}
        </SectionCard>
      ))}
    </div>
  );
}

function InvoicesTab({ invoices }) {
  if (invoices.length === 0) return <div style={{ padding: 24, color: '#536278' }}>No invoices yet.</div>;
  return (
    <div className="space-y-3">
      {invoices.map(inv => (
        <SectionCard key={inv.id}>
          <div className="flex justify-between flex-wrap gap-2">
            <div>
              <span style={{ fontWeight: 600 }}>{inv.invoice_no}</span>
              <StatusBadge status={inv.status} />
            </div>
            <MoneyText value={inv.total_amount} perm={P.INVOICE_VIEW} />
          </div>
          <div style={{ fontSize: 13, color: '#536278', marginTop: 4 }}>
            Due: <DateText value={inv.due_date} /> ·
            Paid: <MoneyText value={inv.paid_amount} perm={P.INVOICE_VIEW} /> ·
            Outstanding: <MoneyText value={inv.outstanding} perm={P.INVOICE_VIEW} />
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function TimelineTab({ order }) {
  const events = [
    { date: order.order_date, label: 'Order created', color: '#006B73' },
    order.status !== 'draft' && { date: order.order_date, label: 'Confirmed', color: '#18794E' },
    order.dispatched_qty > 0 && { date: null, label: 'First dispatch', color: '#006B73' },
  ].filter(Boolean);

  return (
    <div>
      <div style={{ padding: '16px 0' }}>
        {events.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: e.color, marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#12233F' }}>{e.label}</div>
              {e.date && <div style={{ fontSize: 12, color: '#536278' }}><DateText value={e.date} /></div>}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 13, color: '#536278', marginTop: 16 }}>
          Full audit timeline will appear here when backend event log is connected.
        </div>
      </div>
    </div>
  );
}
