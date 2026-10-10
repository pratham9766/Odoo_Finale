import { useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { RemoteSelect } from '@/components/CrudPage';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { useAction, useGet } from '@/lib/hooks';
import { date, quantity } from '@/lib/format';

function Materials() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState();
  const [page, setPage] = useState(1);
  const stock = useGet('/stock', { page, limit: 25, q: q || undefined, kind });
  const rows = stock.payload || [];
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="Search material" style={{ width: 260 }} onSearch={(v) => { setQ(v); setPage(1); }} />
        <Select allowClear placeholder="All kinds" style={{ width: 180 }} value={kind} onChange={(v) => { setKind(v); setPage(1); }}
          options={['fibre', 'yarn', 'grey_fabric', 'finished_fabric', 'dye', 'chemical', 'packing', 'scrap'].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))} />
      </Space>
      <QueryState query={stock}>
        {rows.some((r) => r.is_low) && <Alert className="mb-4" type="warning" showIcon message="Materials below reorder level" description="The highlighted rows need to be bought. This covers the current page." />}
        <Table rowKey="item_id" size="middle" dataSource={rows} scroll={{ x: 760 }} rowClassName={(r) => (r.is_low ? 'low-stock' : '')}
          locale={{ emptyText: <NoData description="No stock yet. Post a goods receipt to add material." /> }}
          pagination={{ current: page, pageSize: 25, total: stock.meta?.total || 0, showSizeChanger: false, onChange: setPage }}
          columns={[
            { title: 'Material', dataIndex: 'name', render: (v, r) => <>{v} {r.is_low && <Tag color="red">low</Tag>}</> }, { title: 'Colour', dataIndex: 'colour' },
            ...['on_hand', 'reserved', 'available', 'reorder_level'].map((k) => ({ title: k.replaceAll('_', ' '), dataIndex: k, align: 'right', render: quantity })),
            { title: 'Unit', dataIndex: 'uom', width: 70 },
          ]} />
      </QueryState>
    </>
  );
}

function FinishedRolls() {
  const finished = useGet('/stock/finished');
  return (
    <QueryState query={finished}>
      <Table rowKey="roll_id" size="middle" dataSource={finished.payload || []} scroll={{ x: 640 }} locale={{ emptyText: <NoData description="No finished rolls waiting for dispatch." /> }}
        columns={[
          { title: 'Roll', dataIndex: 'roll_no', render: (v) => <Link to={`/app/rolls/${encodeURIComponent(v)}`}><strong>{v}</strong></Link> },
          { title: 'Fabric', dataIndex: 'item_name' }, { title: 'Colour', dataIndex: 'colour' }, { title: 'Order', dataIndex: 'order_no' },
          { title: 'Length (m)', dataIndex: 'length_m', align: 'right', render: quantity },
          { title: 'Days on shelf', dataIndex: 'days_on_shelf', align: 'right' }, { title: 'Made', dataIndex: 'created_at', render: date },
        ]} />
    </QueryState>
  );
}

/** a count correction goes through two people where possible: one asks, another approves */
function Adjustments() {
  const session = useSession();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const list = useGet('/stock/adjustments', { limit: 50 });
  return (
    <>
      {session.can('stock.adjust') && <Button type="primary" style={{ marginBottom: 12 }} onClick={() => { form.resetFields(); setOpen(true); }}>Request adjustment</Button>}
      <QueryState query={list}>
        <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 640 }}
          columns={[
            { title: 'No.', dataIndex: 'adj_no' }, { title: 'Item', dataIndex: 'item_name' }, { title: 'Lot', dataIndex: 'lot_no' },
            { title: 'Change', dataIndex: 'qty', align: 'right', render: (v, r) => `${v > 0 ? '+' : ''}${quantity(v)} ${r.uom}` }, { title: 'Reason', dataIndex: 'reason' },
            { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'approved' ? 'green' : v === 'rejected' ? 'red' : 'gold'}>{v}</Tag> },
            { title: '', key: 'a', render: (_, r) => r.status === 'pending' && session.can('stock.adjust_approve') && (
              <Space>
                <Popconfirm title="Approve this adjustment?" onConfirm={() => act.mutate({ path: `/stock/adjustments/${r.id}/approve` })}><Button size="small" type="primary">Approve</Button></Popconfirm>
                <Popconfirm title="Reject it?" onConfirm={() => act.mutate({ path: `/stock/adjustments/${r.id}/reject` })}><Button size="small" danger>Reject</Button></Popconfirm>
              </Space>) },
          ]} />
      </QueryState>
      <Modal title="Request stock adjustment" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => act.mutate({ path: '/stock/adjustments', body: v }, { onSuccess: () => setOpen(false) })}>
          <Form.Item name="item_id" label="Item" rules={[{ required: true }]}><RemoteSelect from={{ path: '/items' }} /></Form.Item>
          <Form.Item name="qty" label="Change in quantity" extra="Use a minus sign to reduce stock, for example -12.5" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3, message: 'Give a reason' }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function Stock() {
  const session = useSession();
  return (
    <>
      <PageTitle title="Inventory" description="What is on hand, reserved and ready for the next order, and the finished rolls waiting for dispatch."
        action={session.can('receipt.view') || session.can('receipt.create') ? <Link to="/app/receipts"><Button>Goods receipts</Button></Link> : null} />
      <section className="panel">
        <Tabs items={[
          { key: 'materials', label: 'Materials', children: <Materials /> },
          { key: 'finished', label: 'Finished rolls', children: <FinishedRolls /> },
          ...(session.can('stock.adjust') || session.can('stock.adjust_approve') ? [{ key: 'adj', label: 'Adjustments', children: <Adjustments /> }] : []),
        ]} />
      </section>
    </>
  );
}
