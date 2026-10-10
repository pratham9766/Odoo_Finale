import { useParams } from 'react-router-dom';
import { Result, Card, Tag, Steps, Typography, Spin, Divider } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { formatDate } from '@/lib/format';

const { Title, Text } = Typography;

export default function PublicTrackPage() {
  const { token } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public', 'track', token],
    queryFn: async () => {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const res = await axios.get(`${baseURL}/api/v1/public/track/${encodeURIComponent(token)}`);
      return res.data?.data || res.data;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F4F6F8' }}>
        <Spin size="large" tip="Loading order tracking…" />
      </div>
    );
  }

  const order = data;

  if (isError || !order) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F4F6F8', padding: 16 }}>
        <Result
          status="404"
          title="Tracking link unavailable"
          subTitle="This link has expired, was not found, or has been revoked. Please contact the mill for assistance."
        />
      </div>
    );
  }

  const steps = [
    { title: 'Order Confirmed', status: 'finish', description: order.order_date ? formatDate(order.order_date) : '' },
    {
      title: 'In Production',
      status: ['in_production', 'in_qc', 'ready_to_ship', 'partially_dispatched', 'dispatched', 'delivered'].includes(order.status)
        ? 'finish'
        : 'wait',
    },
    {
      title: 'Quality Check',
      status: ['ready_to_ship', 'partially_dispatched', 'dispatched', 'delivered'].includes(order.status)
        ? 'finish'
        : 'wait',
    },
    {
      title: 'Dispatched',
      status: ['partially_dispatched', 'dispatched', 'delivered'].includes(order.status)
        ? 'finish'
        : 'wait',
    },
    {
      title: 'Delivered',
      status: order.status === 'delivered' ? 'finish' : 'wait',
    },
  ];

  return (
    <div style={{ background: '#F4F6F8', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{ background: '#12233F', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '18px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <path d="M4 8l8-4 8 4M4 16l8 4 8-4" />
          </svg>
        </div>
        <span className="text-white font-semibold">SAMETA — Live Order Tracking</span>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
        <Card style={{ border: '1px solid #DCE3E9', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#536278', marginBottom: 4 }}>Order Reference</div>
          <Title level={4} style={{ margin: 0 }}>{order.order_no}</Title>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Tag color="cyan">Status: {order.status?.toUpperCase()}</Tag>
            {order.deadline && (
              <Tag icon={<ClockCircleOutlined />}>Expected: {formatDate(order.deadline)}</Tag>
            )}
            {order.progress_pct !== undefined && (
              <Tag color="blue">Progress: {order.progress_pct}%</Tag>
            )}
          </div>
        </Card>

        <Card title="Fulfillment Timeline" style={{ border: '1px solid #DCE3E9', borderRadius: 8 }}>
          <Steps direction="vertical" current={2} items={steps} />
        </Card>
      </div>
    </div>
  );
}
