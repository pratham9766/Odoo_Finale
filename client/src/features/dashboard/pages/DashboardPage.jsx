import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { useDashboard } from '../queries';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { useQueryClient } from '@tanstack/react-query';

import { Row, Col, Alert, Skeleton, Typography, Badge, List, Button, Divider, Progress } from 'antd';
import {
  ThunderboltOutlined, WarningOutlined, CheckCircleOutlined,
  BarChartOutlined, TeamOutlined, DollarOutlined,
  CarOutlined, RightOutlined, AlertOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

import { PageHeader, KpiCard, SectionCard } from '@/components/common';
import { formatINR, formatQty } from '@/lib/format';
import { P } from '@/lib/permissions';

const { Title, Text } = Typography;

const ALERT_ICON = {
  breakdown: <ThunderboltOutlined style={{ color: '#B42318' }} />,
  low_stock: <WarningOutlined style={{ color: '#925400' }} />,
  overdue:   <AlertOutlined    style={{ color: '#B42318' }} />,
  at_risk:   <WarningOutlined  style={{ color: '#925400' }} />,
};

export default function DashboardPage() {
  const { orgId, org } = useOrg();
  const { can } = usePermission();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useDashboard(orgId);

  // Realtime: invalidate dashboard on relevant socket events
  useSocketEvent('machine.status_changed', () => qc.invalidateQueries({ queryKey: ['dashboard', orgId] }));
  useSocketEvent('production.logged',       () => qc.invalidateQueries({ queryKey: ['dashboard', orgId] }));

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
        <Title level={4}>Dashboard unavailable</Title>
        <Text type="secondary">Could not load dashboard data.</Text>
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Dashboard — ${org?.name ?? ''}`}
        subtitle={`Today's operational snapshot`}
        actions={[
          <Button key="refresh" onClick={refetch} size="small">Refresh</Button>,
        ]}
      />

      {/* KPI row */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <KpiCard
          label="Running machines"
          value={isLoading ? null : `${data.running_machines} / ${data.total_machines}`}
          status={data?.idle_machines > 0 || data?.breakdown_machines > 0 ? 'warn' : 'ok'}
          icon={ThunderboltOutlined}
          loading={isLoading}
          onClick={() => navigate('/app/production/board')}
        />
        <KpiCard
          label="Output today"
          value={isLoading ? null : data.today_output_m?.toLocaleString('en-IN')}
          suffix="m"
          status="info"
          icon={BarChartOutlined}
          loading={isLoading}
        />
        <KpiCard
          label="Utilisation"
          value={isLoading ? null : `${data.utilisation_pct}%`}
          status={data?.utilisation_pct >= 70 ? 'ok' : 'warn'}
          loading={isLoading}
        />
        <KpiCard
          label="Workers present"
          value={isLoading ? null : `${data.workers_present} / ${data.workers_total}`}
          status="info"
          icon={TeamOutlined}
          loading={isLoading}
          onClick={() => navigate('/app/workforce/attendance/today')}
        />
        <KpiCard
          label="Orders at risk"
          value={isLoading ? null : data.orders_at_risk}
          status={data?.orders_at_risk > 0 ? 'bad' : 'ok'}
          loading={isLoading}
          onClick={() => navigate('/app/orders')}
        />
        {can(P.REPORTS_PNL) && (
          <KpiCard
            label="This month profit"
            value={isLoading ? null : formatINR(data.profit_this_month)}
            delta={data?.profit_delta_pct}
            status="ok"
            icon={DollarOutlined}
            loading={isLoading}
            onClick={() => navigate('/app/reports/pnl')}
          />
        )}
      </div>

      <Row gutter={[16, 16]}>
        {/* Main column */}
        <Col xs={24} xl={16}>
          {/* Alerts */}
          {!isLoading && data?.alerts?.length > 0 && (
            <SectionCard title="Alerts requiring attention" className="mb-4">
              <List
                size="small"
                dataSource={data.alerts}
                renderItem={alert => (
                  <List.Item
                    actions={[
                      <Link key="open" to={alert.link}>
                        <Button type="text" size="small" icon={<RightOutlined />}>View</Button>
                      </Link>,
                    ]}
                    style={{ padding: '10px 0' }}
                  >
                    <List.Item.Meta
                      avatar={ALERT_ICON[alert.type]}
                      description={<span style={{ fontSize: 14, color: '#12233F' }}>{alert.message}</span>}
                    />
                  </List.Item>
                )}
              />
            </SectionCard>
          )}

          {/* Production chart */}
          <SectionCard
            title="7-day production"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>Metres woven + kg spun</Text>}
          >
            {isLoading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.production_chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DCE3E9" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#536278' }} />
                  <YAxis yAxisId="m" tick={{ fontSize: 12, fill: '#536278' }} />
                  <YAxis yAxisId="kg" orientation="right" tick={{ fontSize: 12, fill: '#536278' }} />
                  <Tooltip contentStyle={{ border: '1px solid #DCE3E9', borderRadius: 6, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="m" type="monotone" dataKey="weaving" name="Weaving (m)" stroke="#006B73" strokeWidth={2} dot={false} />
                  <Line yAxisId="m" type="monotone" dataKey="dyeing"  name="Dyeing (m)"  stroke="#00A3AD" strokeWidth={2} dot={false} />
                  <Line yAxisId="kg" type="monotone" dataKey="spinning" name="Spinning (kg)" stroke="#F08C00" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </Col>

        {/* Priority rail */}
        <Col xs={24} xl={8}>
          {/* Machine status */}
          <SectionCard
            title="Machine status"
            extra={<Link to="/app/production/board"><Button type="text" size="small">Board <RightOutlined /></Button></Link>}
            className="mb-4"
          >
            {isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : (
              <div className="space-y-3">
                {[
                  { label: 'Running',     count: data.running_machines,     color: '#18794E' },
                  { label: 'Idle',        count: data.idle_machines,        color: '#F08C00' },
                  { label: 'Breakdown',   count: data.breakdown_machines,   color: '#B42318' },
                  { label: 'Maintenance', count: data.maintenance_machines, color: '#536278' },
                ].map(row => (
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
                  <span style={{ fontSize: 14, color: '#536278' }}>Utilisation</span>
                  <span style={{ fontWeight: 700, color: data.utilisation_pct >= 70 ? '#18794E' : '#F08C00', fontVariantNumeric: 'tabular-nums' }}>
                    {data.utilisation_pct}%
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Priority orders */}
          <SectionCard
            title="Orders needing action"
            extra={<Link to="/app/orders"><Button type="text" size="small">All <RightOutlined /></Button></Link>}
          >
            {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
              <div>
                {(data.orders_at_risk > 0 ? [] : []).length === 0 && (
                  <div style={{ padding: '12px 0', color: '#536278', fontSize: 14 }}>
                    Loading active orders…
                  </div>
                )}
                {/* Hardcoded for fixture clarity — replace with order query in Phase 2 */}
                <Link to="/app/orders/ord-003" style={{ display: 'block', padding: '10px 0', borderBottom: '1px solid #F4F6F8' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#12233F' }}>ORD-2026-0138</div>
                  <div style={{ fontSize: 12, color: '#B42318', marginTop: 2 }}>⚠ Missed deadline — ready to ship, not dispatched</div>
                </Link>
                <Link to="/app/orders/ord-004" style={{ display: 'block', padding: '10px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#12233F' }}>ORD-2026-0155</div>
                  <div style={{ fontSize: 12, color: '#925400', marginTop: 2 }}>⚡ Waiting material — yarn shortage 20 kg</div>
                </Link>
              </div>
            )}
          </SectionCard>
        </Col>
      </Row>
    </div>
  );
}
