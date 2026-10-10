import { useState } from 'react';
import { Button, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RemoteSelect } from '@/components/CrudPage';
import { PageTitle, QueryState, Status } from '@/components/States';
import { useSession } from '@/context/Session';
import { useAction, useGet } from '@/lib/hooks';
import { date, money, quantity } from '@/lib/format';

/** goods received note: the list of GRNs, newest first */
export function Receipts() {
  const session = useSession();
  const [status, setStatus] = useState();
  const list = useGet('/receipts', { limit: 100, status });
  return (
    <>
      <PageTitle title="Goods receipts" description="Yarn and material arriving at the gate. A receipt adds to stock only when it is posted."
        action={session.can('receipt.create') && <Link to="/app/receipts/new"><Button type="primary">New receipt</Button></Link>} />
      <section className="panel">
        <Select allowClear placeholder="All statuses" value={status} onChange={setStatus} style={{ width: 180, marginBottom: 12 }}
          options={['draft', 'posted', 'cancelled'].map((v) => ({ value: v, label: v }))} />
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} pagination={{ pageSize: 20, hideOnSinglePage: true }}
            columns={[
              { title: 'GRN', dataIndex: 'grn_no', render: (v, r) => <Link to={`/app/receipts/${r.id}`}><strong>{v}</strong></Link> },
              { title: 'Supplier', dataIndex: 'supplier_name' }, { title: 'Vehicle', dataIndex: 'vehicle_no' },
              { title: 'Lines', dataIndex: 'line_count', width: 70 }, { title: 'Status', dataIndex: 'status', render: (v) => <Status value={v === 'posted' ? 'delivered' : v} /> },
              { title: 'Received', dataIndex: 'posted_at', render: (v, r) => date(v || r.created_at) },
            ]} />
        </QueryState>
      </section>
    </>
  );
}

export function NewReceipt() {
  const act = useAction({ success: 'Receipt saved as a draft' });
  const navigate = useNavigate();
  const [form] = Form.useForm();

  function submit(v) {
    const lines = v.lines.map((l) => ({
      item_id: l.item_id, lot_no: l.lot_no, received_qty: l.received_qty, rate: l.rate ?? 0,
      ...(l.expected_qty != null ? { expected_qty: l.expected_qty } : {}), ...(l.warehouse_id ? { warehouse_id: l.warehouse_id } : {}), ...(l.dye_batch ? { dye_batch: l.dye_batch } : {}),
    }));
    act.mutate({ path: '/receipts', body: { supplier_contact_id: v.supplier_contact_id, vehicle_no: v.vehicle_no || undefined, notes: v.notes || undefined, lines } },
      { onSuccess: (res) => navigate(`/app/receipts/${res.data.id}`) });
  }

  return (
    <>
      <PageTitle title="New goods receipt" description="Enter what arrived. Save it as a draft, check it, then post it to add it to stock." />
      <section className="panel form-panel">
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ lines: [{ rate: 0 }] }}>
          <div className="form-grid">
            <Form.Item name="supplier_contact_id" label="Supplier" rules={[{ required: true, message: 'Choose the supplier' }]}><RemoteSelect from={{ path: '/contacts', params: { type: 'supplier' } }} /></Form.Item>
            <Form.Item name="vehicle_no" label="Vehicle number"><Input /></Form.Item>
          </div>
          <h3>Material received</h3>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <div className="order-line" key={f.key}>
                    <Form.Item name={[f.name, 'item_id']} label="Item" rules={[{ required: true, message: 'Choose the item' }]}><RemoteSelect from={{ path: '/items' }} /></Form.Item>
                    <Form.Item name={[f.name, 'lot_no']} label="Lot number" rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item>
                    <Form.Item name={[f.name, 'expected_qty']} label="Expected qty"><InputNumber min={0} /></Form.Item>
                    <Form.Item name={[f.name, 'received_qty']} label="Received qty" rules={[{ required: true, message: 'Required' }]}><InputNumber min={0} /></Form.Item>
                    <Form.Item name={[f.name, 'rate']} label="Rate (INR)"><InputNumber min={0} /></Form.Item>
                    <Form.Item name={[f.name, 'warehouse_id']} label="Warehouse"><RemoteSelect from={{ path: '/warehouses' }} /></Form.Item>
                    <Button danger disabled={fields.length === 1} onClick={() => remove(f.name)}>Remove</Button>
                  </div>
                ))}
                <Button onClick={() => add({ rate: 0 })}>+ Add line</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="notes" label="Notes" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
          <Space><Button type="primary" htmlType="submit" size="large" loading={act.isPending}>Save draft</Button><Link to="/app/receipts">Cancel</Link></Space>
        </Form>
      </section>
    </>
  );
}

export function ReceiptDetail() {
  const { id } = useParams();
  const session = useSession();
  const act = useAction();
  const q = useGet(`/receipts/${id}`);
  const g = q.payload;
  const hasPrice = g?.lines?.some((l) => l.rate !== undefined);
  return (
    <>
      <Link to="/app/receipts">← All receipts</Link>
      <PageTitle title={g?.grn_no || 'Goods receipt'} description="Posting adds the received quantities to stock, one lot per line."
        action={g?.status === 'draft' && (
          <Space>
            {session.can('receipt.post') && <Popconfirm title="Post this receipt into stock?" onConfirm={() => act.mutate({ path: `/receipts/${id}/post` })}><Button type="primary" loading={act.isPending}>Post to stock</Button></Popconfirm>}
            {session.can('receipt.delete') && <Popconfirm title="Cancel this receipt?" onConfirm={() => act.mutate({ path: `/receipts/${id}/cancel` })}><Button danger>Cancel receipt</Button></Popconfirm>}
          </Space>
        )} />
      <section className="panel">
        <QueryState query={q}>
          {g && (
            <>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} items={[
                { key: 's', label: 'Supplier', children: g.supplier_name || '–' }, { key: 'v', label: 'Vehicle', children: g.vehicle_no || '–' },
                { key: 'st', label: 'Status', children: <Status value={g.status === 'posted' ? 'delivered' : g.status} /> },
                { key: 'p', label: 'Posted', children: date(g.posted_at) }, { key: 'n', label: 'Notes', children: g.notes || '–' },
              ]} />
              <h3>Lines</h3>
              <Table rowKey="id" size="small" pagination={false} dataSource={g.lines}
                columns={[
                  { title: 'Item', dataIndex: 'item_name' }, { title: 'Lot', dataIndex: 'lot_no' },
                  { title: 'Expected', dataIndex: 'expected_qty', align: 'right', render: quantity }, { title: 'Received', dataIndex: 'received_qty', align: 'right', render: quantity },
                  { title: 'Unit', dataIndex: 'uom', width: 70 }, ...(hasPrice ? [{ title: 'Rate', dataIndex: 'rate', align: 'right', render: money }] : []),
                ]} />
            </>
          )}
        </QueryState>
      </section>
    </>
  );
}
