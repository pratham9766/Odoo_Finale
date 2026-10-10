import { useState } from 'react';
import { Button, Descriptions, Drawer, Input, Popconfirm, Space, Table, Tag } from 'antd';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { monthISO, useAction, useGet } from '@/lib/hooks';
import { money } from '@/lib/format';

const STATUS = { draft: 'gold', approved: 'blue', paid: 'green' };

function RunDrawer({ id, onClose }) {
  const session = useSession();
  const act = useAction();
  const q = useGet(`/wages/runs/${id}`, {}, { enabled: !!id });
  const run = q.payload;
  const month = run?.month?.slice(0, 7);
  const slip = (l) => session.download(`/wages/payslips/${l.worker_id}?month=${month}`, `payslip-${l.emp_code}-${month}.pdf`).catch(() => {});
  return (
    <Drawer open={!!id} onClose={onClose} width={860} title={run ? `Wages for ${month}` : 'Wage run'}
      extra={run && (
        <Space>
          {run.status === 'draft' && session.can('wages.pay') && <Popconfirm title="Approve this wage run?" onConfirm={() => act.mutate({ path: `/wages/runs/${id}/approve` })}><Button type="primary" loading={act.isPending}>Approve</Button></Popconfirm>}
          {run.status === 'approved' && session.can('wages.pay') && <Popconfirm title="Mark this run as paid?" onConfirm={() => act.mutate({ path: `/wages/runs/${id}/pay` })}><Button type="primary" loading={act.isPending}>Mark paid</Button></Popconfirm>}
        </Space>)}>
      <QueryState query={q}>
        {run && (
          <>
            <Descriptions column={{ xs: 1, sm: 3 }} items={[
              { key: 's', label: 'Status', children: <Tag color={STATUS[run.status]}>{run.status}</Tag> },
              { key: 'g', label: 'Gross', children: money(run.total_gross) }, { key: 'n', label: 'Net payable', children: <strong>{money(run.total_net)}</strong> },
            ]} />
            <Table rowKey="id" size="small" style={{ marginTop: 16 }} pagination={false} dataSource={run.lines} scroll={{ x: 'max-content', y: 460 }}
              columns={[
                { title: 'Code', dataIndex: 'emp_code' }, { title: 'Worker', dataIndex: 'name' }, { title: 'Wage', dataIndex: 'wage_type' },
                { title: 'Days', dataIndex: 'days', align: 'right' }, { title: 'OT h', dataIndex: 'ot_hours', align: 'right' },
                { title: 'Gross', dataIndex: 'gross', align: 'right', render: money }, { title: 'Deductions', dataIndex: 'deductions', align: 'right', render: money }, { title: 'Net', dataIndex: 'net', align: 'right', render: money },
                { title: '', key: 'p', render: (_, l) => <Button size="small" onClick={() => slip(l)}>Payslip</Button> },
              ]} />
          </>
        )}
      </QueryState>
    </Drawer>
  );
}

export default function Wages() {
  const session = useSession();
  const act = useAction({ success: 'Wage run prepared' });
  const [month, setMonth] = useState(monthISO());
  const [open, setOpen] = useState(null);
  const list = useGet('/wages/runs', { limit: 50 });
  return (
    <>
      <PageTitle eyebrow="WORKFORCE" title="Wages" description="Month-end pay worked out from attendance, overtime and piece work. Prepare the run, check it, approve it, then mark it paid."
        action={session.can('wages.run') && (
          <Space>
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 160 }} />
            <Button type="primary" loading={act.isPending} onClick={() => act.mutate({ path: '/wages/runs', body: { month } })}>Prepare wage run</Button>
          </Space>)} />
      <section className="panel">
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} pagination={{ pageSize: 12, hideOnSinglePage: true }} locale={{ emptyText: <NoData description="No wage runs yet. Prepare one for a month." /> }}
            columns={[
              { title: 'Month', dataIndex: 'month', render: (v) => <strong>{v?.slice(0, 7)}</strong> },
              { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={STATUS[v]}>{v}</Tag> },
              { title: 'Gross', dataIndex: 'total_gross', align: 'right', render: money }, { title: 'Net', dataIndex: 'total_net', align: 'right', render: money },
              { title: '', key: 'a', render: (_, r) => <Button size="small" onClick={() => setOpen(r.id)}>Open</Button> },
            ]} />
        </QueryState>
      </section>
      <RunDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
