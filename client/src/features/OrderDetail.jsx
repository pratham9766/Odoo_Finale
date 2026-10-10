import { useState } from 'react';
import { Alert, Button, Descriptions, Input, Modal, Popconfirm, Progress, Space, Table, Tag, Timeline, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';
import MaterialSummary from '@/components/MaterialSummary';
import { PageTitle, QueryState, Status } from '@/components/States';
import { useSession } from '@/context/Session';
import { useAction, useGet } from '@/lib/hooks';
import { date, money, quantity } from '@/lib/format';

const RISK = { red: 'red', amber: 'orange', green: 'green' };
const PLANNABLE = ['confirmed', 'waiting_material', 'material_ready'];

export default function OrderDetail() {
  const { id } = useParams();
  const session = useSession();
  const act = useAction();
  const [link, setLink] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const q = useGet(`/orders/${id}`, {}, { refetchInterval: 60000 });
  const o = q.payload;
  const needsCheck = o && !['cancelled', 'delivered', 'dispatched'].includes(o.status);
  const req = useGet(`/orders/${id}/requirements`, {}, { enabled: !!needsCheck && (session.can('orders.view') || session.can('bom.view')) });
  const post = (suffix, body, opts) => act.mutate({ path: `/orders/${id}/${suffix}`, body }, opts);

  const lineColumns = [
    { title: 'Item', dataIndex: 'description' }, { title: 'Colour', dataIndex: 'colour' },
    { title: 'Quantity', dataIndex: 'qty', align: 'right', render: quantity }, { title: 'Unit', dataIndex: 'uom', width: 70 },
    ...(session.can('orders.view_price') ? [{ title: 'Rate', dataIndex: 'rate', align: 'right', render: money }] : []),
  ];

  return (
    <>
      <Link to="/app/orders">← All orders</Link>
      <PageTitle eyebrow="ORDER" title={o?.order_no || 'Order details'} description="One record, from the request through production and delivery."
        action={o && (
          <Space wrap>
            {o.status === 'draft' && session.can('orders.confirm') && (
              <Popconfirm title="Confirm this order and reserve the material that is in stock?" onConfirm={() => post('confirm', { auto_po: false })}><Button type="primary" loading={act.isPending}>Confirm order</Button></Popconfirm>
            )}
            {PLANNABLE.includes(o.status) && session.can('production.plan') && (
              <Popconfirm title="Create the work orders for every stage of this order?" onConfirm={() => post('plan')}><Button type="primary" loading={act.isPending}>Plan production</Button></Popconfirm>
            )}
            {['confirmed', 'waiting_material'].includes(o.status) && session.can('orders.confirm') && <Button onClick={() => post('reserve')}>Reserve material</Button>}
            {session.can('orders.view') && o.status !== 'cancelled' && <Button onClick={() => post('tracking-link', undefined, { onSuccess: (res) => setLink(res.data) })}>Buyer tracking link</Button>}
            {!['cancelled', 'delivered', 'dispatched'].includes(o.status) && session.can('orders.cancel') && <Button danger onClick={() => setCancelling(true)}>Cancel order</Button>}
          </Space>
        )} />
      <QueryState query={q}>
        {o && (
          <>
            <section className="panel">
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} items={[
                { key: 'b', label: 'Buyer', children: o.buyer_name }, { key: 'd', label: 'Deadline', children: date(o.deadline) }, { key: 's', label: 'Status', children: <Status value={o.status} /> },
                { key: 'p', label: 'Priority', children: o.priority }, { key: 'r', label: 'Risk', children: o.risk ? <Tag color={RISK[o.risk]}>{o.risk}</Tag> : '–' },
                { key: 'e', label: 'Expected completion', children: date(o.expected_completion) }, { key: 'st', label: 'Current stage', children: o.current_stage || '–' },
                { key: 'n', label: 'Notes', children: o.notes || '–' },
              ]} />
              <Progress percent={Math.round(Number(o.progress_pct) || 0)} status={o.risk === 'red' ? 'exception' : 'active'} style={{ marginTop: 8 }} />
            </section>

            <section className="panel"><h3>Fabric requirements</h3><Table rowKey="id" size="small" columns={lineColumns} dataSource={o.lines || []} pagination={false} scroll={{ x: 500 }} /></section>

            {needsCheck && req.payload && (
              <section className="panel"><h3>Do we have enough material?</h3><MaterialSummary summary={req.payload.summary} orderId={o.id} /></section>
            )}

            <div className="grid-2">
              <section className="panel"><h3>Progress</h3>
                <Descriptions size="small" column={1} items={[
                  { key: 'wo', label: 'Work orders', children: (o.work_orders || []).map((w) => `${w.count} ${w.status}`).join(', ') || 'None yet' },
                  { key: 'ro', label: 'Rolls', children: (o.rolls || []).map((r) => `${r.count} ${r.status.replace('_', ' ')} (${quantity(r.length_m)} m)`).join(', ') || 'None yet' },
                  { key: 'rs', label: 'Material reserved', children: o.reservations?.lines ? `${o.reservations.lines} lots` : 'None' },
                ]} />
                {session.can('production.view') && <Link to="/app/work-orders"><Button size="small" style={{ marginTop: 8 }}>Work orders</Button></Link>}
              </section>
              <section className="panel"><h3>Dispatches and invoices</h3>
                <Table size="small" rowKey="id" pagination={false} dataSource={o.dispatches || []} locale={{ emptyText: 'Nothing dispatched yet' }}
                  columns={[{ title: 'Dispatch', dataIndex: 'dispatch_no', render: (v, r) => (session.can('dispatch.view') ? <Link to={`/app/dispatch/${r.id}`}>{v}</Link> : v) }, { title: 'Status', dataIndex: 'status' }, { title: 'Confirmed', dataIndex: 'confirmed_at', render: date }]} />
                {o.invoices?.length > 0 && (
                  <Table size="small" rowKey="id" pagination={false} style={{ marginTop: 12 }} dataSource={o.invoices}
                    columns={[{ title: 'Invoice', dataIndex: 'invoice_no' }, { title: 'Total', dataIndex: 'total', align: 'right', render: money }, { title: 'Status', dataIndex: 'status' }]} />
                )}
              </section>
            </div>

            <section className="panel"><h3>History</h3>
              <Timeline items={(o.events || []).map((e) => ({ children: <><strong>{e.event.replaceAll('_', ' ')}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(e.created_at).toLocaleString('en-IN')}</span></> }))} />
            </section>
          </>
        )}
      </QueryState>

      <Modal title="Buyer tracking link" open={!!link} onCancel={() => setLink(null)} footer={<Button type="primary" onClick={() => setLink(null)}>Done</Button>}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Send this link to the buyer" description="They see the order status, progress and expected date. No prices, no login." />
        {link && <Typography.Paragraph copyable={{ text: link.url }} style={{ wordBreak: 'break-all' }}>{link.url}</Typography.Paragraph>}
      </Modal>
      <Modal title="Cancel this order?" open={cancelling} onCancel={() => setCancelling(false)} okText="Cancel order" okButtonProps={{ danger: true, loading: act.isPending }}
        onOk={() => post('cancel', reason ? { reason } : {}, { onSuccess: () => setCancelling(false) })}>
        <p>Reserved material is released. This cannot be undone.</p>
        <Input.TextArea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}
