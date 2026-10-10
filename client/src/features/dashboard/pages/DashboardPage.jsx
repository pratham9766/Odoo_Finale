import { useMemo } from 'react';
import { Row, Col, Alert, Skeleton, Typography, List, Button, Divider } from 'antd';
import {
  ThunderboltOutlined, WarningOutlined,
  BarChartOutlined, TeamOutlined, DollarOutlined,
  RightOutlined, AlertOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { useMill } from '@/hooks/useMill';
import { usePermission } from '@/hooks/usePermission';
import { useDashboard } from '../queries';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { PageHeader, KpiCard, SectionCard } from '@/components/common';
import { formatINR } from '@/lib/format';
import { P } from '@/lib/permissions';

const { Title, Text } = Typography;

export default function DashboardPage() {
  const { mill } = useMill();
  const { can } = usePermission();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useDashboard();

  // Invalidate on socket changes
  useSocketEvent('machine.status_changed', () => qc.invalidateQueries({ queryKey: ['dashboard'] }));
  useSocketEvent('production.logged', () => qc.invalidateQueries({ queryKey: ['dashboard'] }));

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
        <Title level={4}>Dashboard unavailable</Title>
        <Text type="secondary">Could not load dashboard data from server.</Text>
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }

  // Backend shape from GET /reports/dashboard
  const prod = data?.production || {};
  const ords = data?.orders || {};
  const att = data?.attendance || {};
  const fin = data?.finance || {};
  const alertsObj = data?.alerts || {};

  // Normalize alerts into list items
  const alertList = [];
  if (alertsObj.machines_down?.length > 0) {
    alertList.push({
      key: 'machines_down',
      icon: <ThunderboltOutlined style={{ color: '#B42318' }} />,
      message: `Machines in breakdown: ${alertsObj.machines_down.join(', ')}`,
      link: '/app/production/board',
    });
  }
  if (alertsObj.low_stock > 0) {
    alertList.push({
      key: 'low_stock',
      icon: <WarningOutlined style={{ color: '#925400' }} />,
      message: `${alertsObj.low_stock} inventory items below reorder level`,
      link: '/app/inventory/stock',
    });
  }
  if (alertsObj.overdue?.invoices > 0) {
    alertList.push({
      key: 'overdue',
      icon: <AlertOutlined style={{ color: '#B42318' }} />,
      message: `${alertsObj.overdue.invoices} buyer invoices overdue (${formatINR(alertsObj.overdue.amount)})`,
      link: '/app/finance/invoices',
    });
  }
  if (ords.red > 0) {
    alertList.push({
      key: 'orders_at_risk',
      icon: <WarningOutlined style={{ color: '#B42318' }} />,
      message: `${ords.red} customer orders at critical deadline risk`,
      link: '/app/orders',
    });
  }

  const runningMachines = prod.running ?? 0;
  const totalMachines = prod.total ?? 0;
  const outputTodayM = prod.today?.m ?? 0;
  const outputTodayKg = prod.today?.kg ?? 0;
  const utilisationPct = prod.utilisation_pct ?? 0;

  const workersPresent = att.present ?? 0;
  const workersExpected = att.expected ?? (workersPresent + (att.absent ?? 0));

  const ordersAtRisk = (ords.red ?? 0) + (ords.amber ?? 0);
  const profitThisMonth = fin.net_profit ?? 0;
  const profitChangePct = fin.change_pct;

  const chartData = prod.last_7_days || [];

  return (
    <div>
      <PageHeader
        title={`Dashboard — ${mill?.name || 'Everest Textile Mills'}`}
        subtitle="Today's live operational snapshot"
        actions={[
          <Button key="refresh" onClick={refetch} size="small">Refresh</Button>,
        ]}
      />

      {/* 5 PDF Key Metric Tiles */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <KpiCard
          label="Running machines"
          value={isLoading ? null : `${runningMachines} / ${totalMachines}`}
          status={runningMachines < totalMachines ? 'warn' : 'ok'}
          icon={ThunderboltOutlined}
          loading={isLoading}
          onClick={() => navigate('/app/production/board')}
        />
        <KpiCard
          label="Today's output"
          value={isLoading ? null : `${Number(outputTodayM).toLocaleString('en-IN')}`}
          suffix="m"
          status="info"
          icon={BarChartOutlined}
          loading={isLoading}
        />
        <KpiCard
          label="Utilisation"
          value={isLoading ? null : `${utilisationPct}%`}
          status={utilisationPct >= 70 ? 'ok' : 'warn'}
          loading={isLoading}
        />
        <KpiCard
          label="Workers present"
          value={isLoading ? null : `${workersPresent} / ${workersExpected}`}
          status="info"
          icon={TeamOutlined}
          loading={isLoading}
          onClick={() => navigate('/app/workforce/attendance/today')}
        />
        <KpiCard
          label="Orders at risk"
          value={isLoading ? null : ordersAtRisk}
          status={ordersAtRisk > 0 ? 'bad' : 'ok'}
          loading={isLoading}
          onClick={() => navigate('/app/orders')}
        />
        {can(P.REPORTS_PNL) && (
          <KpiCard
            label="Profit this month"
            value={isLoading ? null : formatINR(profitThisMonth)}
            delta={profitChangePct}
            status="ok"
            icon={DollarOutlined}
            loading={isLoading}
            onClick={() => navigate('/app/reports/order-cost')}
          />
        )}
      </div>

      <Row gutter={[16, 16]}>
        {/* Main column */}
        <Col xs={24} xl={16}>
          {/* Alerts */}
          {!isLoading && alertList.length > 0 && (
            <SectionCard title="Alerts Requiring Attention" className="mb-4">
              <List
                size="small"
                dataSource={alertList}
                renderItem={(alert) => (
                  <List.Item
                    actions={[
                      <Link key="open" to={alert.link}>
                        <Button type="text" size="small" icon={<RightOutlined />}>View</Button>
                      </Link>,
                    ]}
                    style={{ padding: '8px 0' }}
                  >
                    <List.Item.Meta
                      avatar={alert.icon}
                      description={<span style={{ fontSize: 14, color: '#12233F' }}>{alert.message}</span>}
                    />
                  </List.Item>
                )}
              />
            </SectionCard>
          )}

          {/* 7-day Production Chart */}
          <SectionCard
            title="7-Day Stage Production"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>Daily output per stage</Text>}
          >
            {isLoading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DCE3E9" />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#536278' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#536278' }} />
                  <Tooltip contentStyle={{ border: '1px solid #DCE3E9', borderRadius: 6, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="qty" name="Output" stroke="#006B73" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#536278' }}>
                No stage output logged yet this week.
              </div>
            )}
          </SectionCard>
        </Col>

        {/* Priority rail */}
        <Col xs={24} xl={8}>
          {/* Machine status breakdown */}
          <SectionCard
            title="Machine Status"
            extra={<Link to="/app/production/board"><Button type="text" size="small">Board <RightOutlined /></Button></Link>}
            className="mb-4"
          >
            {isLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Running', count: runningMachines, color: '#18794E' },
                  { label: 'Idle', count: prod.idle ?? 0, color: '#F08C00' },
                  { label: 'Breakdown', count: prod.breakdown ?? 0, color: '#B42318' },
                  { label: 'Maintenance', count: prod.maintenance ?? 0, color: '#536278' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, color: '#12233F' }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: '#12233F', fontVariantNumeric: 'tabular-nums', fontSize: 16 }}>
                      {row.count}
                    </span>
                  </div>
                ))}
                <Divider style={{ margin: '8px 0' }} />
                <div className="flex justify-between">
                  <span style={{ fontSize: 14, color: '#536278' }}>Floor Utilisation</span>
                  <span style={{ fontWeight: 700, color: utilisationPct >= 70 ? '#18794E' : '#F08C00' }}>
                    {utilisationPct}%
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Orders needing attention */}
          <SectionCard
            title="Orders Needing Attention"
            extra={<Link to="/app/orders"><Button type="text" size="small">All <RightOutlined /></Button></Link>}
          >
            {isLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : ords.needs_attention?.length > 0 ? (
              <div>
                {ords.needs_attention.map((o) => (
                  <Link
                    key={o.id}
                    to={`/app/orders/${o.id}`}
                    style={{ display: 'block', padding: '10px 0', borderBottom: '1px solid #F4F6F8' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#12233F' }}>{o.order_no}</div>
                    <div style={{ fontSize: 12, color: o.risk === 'red' ? '#B42318' : '#925400', marginTop: 2 }}>
                      {o.risk === 'red' ? '⚠ Critical deadline risk' : '⚡ Attention needed'} — {o.status} ({o.progress_pct || 0}%)
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px 0', color: '#536278', fontSize: 13, textAlign: 'center' }}>
                All active orders are on schedule.
              </div>
            )}
          </SectionCard>
        </Col>
      </Row>
    </div>
  );
}
