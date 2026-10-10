import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Progress, Result, Skeleton, Table, Timeline } from 'antd';
import { useParams } from 'react-router-dom';
import { request } from '@/lib/api';
import { Status } from '@/components/States';
import { date, quantity } from '@/lib/format';
import { usePageTitle } from '@/lib/title';


/** The buyer's page: opened from the link the mill sends. No login, no prices. */
export default function Track() {
  usePageTitle('Order tracking');
  const { token } = useParams();
  const q = useQuery({
    queryKey: ['track', token],
    queryFn: ({ signal }) => request(`/public/track/${encodeURIComponent(token)}`, { signal }),
    retry: false,
    refetchInterval: 60000,
  });

  if (q.isPending) return <div className="center"><Card className="setup-card"><Skeleton active /></Card></div>;
  if (q.isError) return <div className="center"><Result status="404" title="Tracking link not found" subTitle="The link may be wrong or no longer active. Ask the mill for a new one." /></div>;
  const t = q.data.data;

  return (
    <div className="center" style={{ alignItems: 'flex-start', padding: 24 }}>
      <Card title={<><span style={{ color: '#8C948E', fontSize: 12, display: 'block' }}>{t.mill}</span>Order {t.order_no}</>} style={{ maxWidth: 640, width: '100%' }}>
        <Descriptions column={1} items={[
          { key: 's', label: 'Status', children: <Status value={t.status} /> },
          { key: 'st', label: 'Now at', children: t.current_stage || '–' },
          { key: 'd', label: 'Promised date', children: date(t.deadline) },
          { key: 'e', label: 'Expected completion', children: date(t.expected_completion) },
        ]} />
        <Progress percent={Math.round(Number(t.progress_pct) || 0)} style={{ margin: '8px 0 16px' }} />
        <Table size="small" rowKey={(r, i) => i} pagination={false} dataSource={t.lines || []}
          columns={[{ title: 'Fabric', dataIndex: 'description' }, { title: 'Colour', dataIndex: 'colour' }, { title: 'Quantity', dataIndex: 'qty', align: 'right', render: (v, r) => `${quantity(v)} ${r.uom}` }]} />
        <h3 style={{ marginTop: 20 }}>Updates</h3>
        <Timeline items={(t.events || []).map((e) => ({ children: <><strong>{e.event.replaceAll('_', ' ')}</strong> <span style={{ color: '#8C948E', fontSize: 12 }}>{new Date(e.at).toLocaleString('en-IN')}</span></> }))} />
      </Card>
    </div>
  );
}
