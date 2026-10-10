import { useParams } from 'react-router-dom';
import { Result, Card, Tag, Steps, Typography, Divider, Alert } from 'antd';
import { ClockCircleOutlined, CarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ORDERS, DISPATCHES } from '@/mocks/fixtures';
import { formatDate } from '@/lib/format';

const { Title, Text } = Typography;

export default function PublicTrackPage() {
  const { token } = useParams();
  const order = ORDERS.find(o => o.tracking_token === token);

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-appbg p-4">
        <Result
          status="404"
          title="Tracking link unavailable"
          subTitle="This link has expired or is invalid. Please contact the mill for a new tracking link."
        />
      </div>
    );
  }

  const dispatches = DISPATCHES.filter(d => d.order_id === order.id);

  const steps = [
    { title: 'Order confirmed', status: 'finish', description: formatDate(order.order_date) },
    { title: 'In production',   status: order.status === 'confirmed' ? 'wait' : 'finish', description: '' },
    { title: 'Quality check',   status: ['dispatched','partially_dispatched','ready_to_ship','delivered'].includes(order.status) ? 'finish' : 'wait', description: '' },
    { title: 'Dispatched',      status: ['partially_dispatched','dispatched','delivered'].includes(order.status) ? 'finish' : 'wait', description: dispatches[0] ? formatDate(dispatches[0]?.confirmed_at) : '' },
    { title: 'Delivered',       status: order.status === 'delivered' ? 'finish' : 'wait', description: '' },
  ];

  return (
    <div style={{ background: '#F4F6F8', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{ background: '#12233F', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '18px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
          </svg>
        </div>
        <span className="text-white font-semibold">SAMETA — Order tracking</span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>
        <Card style={{ border: '1px solid #DCE3E9', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#536278', marginBottom: 4 }}>Order reference</div>
          <Title level={4} style={{ margin: 0 }}>{order.order_no}</Title>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Tag>{order.lines[0]?.item_name}</Tag>
            <Tag color="blue">{order.ordered_qty} {order.lines[0]?.uom}</Tag>
            {order.deadline && (
              <Tag icon={<ClockCircleOutlined />}>Due {formatDate(order.deadline)}</Tag>
            )}
          </div>
        </Card>

        <Card style={{ border: '1px solid #DCE3E9', borderRadius: 8, marginBottom: 16 }}>
          <Title level={5}>Order progress</Title>
          <Steps items={steps} direction="vertical" size="small" />
        </Card>

        {/* Quantities */}
        <Card style={{ border: '1px solid #DCE3E9', borderRadius: 8, marginBottom: 16 }}>
          <Title level={5}>Quantities</Title>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Ordered', value: `${order.ordered_qty} m` },
              { label: 'QC approved', value: `${order.qc_approved_qty} m` },
              { label: 'Dispatched', value: `${order.dispatched_qty} m` },
              { label: 'Remaining', value: `${order.remaining_qty} m` },
            ].map(q => (
              <div key={q.label}>
                <div style={{ fontSize: 12, color: '#536278' }}>{q.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#12233F', fontVariantNumeric: 'tabular-nums' }}>{q.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Dispatches */}
        {dispatches.length > 0 && (
          <Card style={{ border: '1px solid #DCE3E9', borderRadius: 8 }}>
            <Title level={5}>Shipments</Title>
            {dispatches.map(d => (
              <div key={d.id} style={{ padding: '12px 0', borderBottom: '1px solid #F4F6F8' }}>
                <div className="flex justify-between">
                  <span style={{ fontWeight: 600 }}>{d.dispatch_no}</span>
                  <Tag color={d.status === 'delivered' ? 'success' : 'processing'}>{d.status.replace('_', ' ')}</Tag>
                </div>
                <div style={{ fontSize: 13, color: '#536278', marginTop: 4 }}>
                  {d.total_length_m} m · {d.rolls_count} rolls
                </div>
                {d.vehicle_no && (
                  <div style={{ fontSize: 13, color: '#536278', marginTop: 2 }}>
                    <CarOutlined /> Vehicle: {d.vehicle_no}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#536278', marginTop: 2 }}>
                  Dispatched: {formatDate(d.confirmed_at)}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* ETA */}
        {!order.expected_completion && (
          <Alert
            className="mt-4"
            type="info"
            message="Expected completion: Not estimated"
            description="The mill has not yet set an estimated completion date for this order."
          />
        )}

        <div style={{ marginTop: 24, fontSize: 12, color: '#536278', textAlign: 'center' }}>
          This page shows order status and quantities only. No financial or internal mill data is included.
        </div>
      </div>
    </div>
  );
}
