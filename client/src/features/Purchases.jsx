import { useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Table, Tag } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RemoteSelect } from '@/components/CrudPage';
import { PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { clean, useAction, useGet } from '@/lib/hooks';
import { date, money, quantity } from '@/lib/format';

const STATUSES = ['draft', 'sent', 'accepted', 'partially_accepted', 'rejected', 'received', 'closed', 'cancelled'];
const COLOR = { draft: 'default', sent: 'blue', accepted: 'green', partially_accepted: 'gold', rejected: 'red', received: 'green', closed: 'default', cancelled: 'default' };
const label = (v) => (v || '').replaceAll('_', ' ');
const PoStatus = ({ value }) => <Tag color={COLOR[value]}>{label(value)}</Tag>;

/** Purchase orders to suppliers: draft → (approved) → sent → supplier accepts / partly accepts / rejects. */
export default function Purchases() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState();
  const [openId, setOpenId] = useState(null);
  const list = useGet('/purchase-orders', { limit: 100, status });
  const creating = params.get('new') === '1';
  const closeNew = () => { params.delete('new'); params.delete('order'); setParams(params, { replace: true }); };

  return (
    <>
      <PageTitle eyebrow="PURCHASING" title="Purchase orders" description="Yarn and material ordered from suppliers, from draft to the supplier's reply."
        action={session.can('po.create') && <Button type="primary" onClick={() => setParams({ new: '1' })}>New purchase order</Button>} />
      <section className="panel">
        <Select allowClear placeholder="All statuses" value={status} onChange={setStatus} style={{ width: 200, marginBottom: 12 }}
          options={STATUSES.map((v) => ({ value: v, label: label(v) }))} />
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 720 }}
            onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'PO', dataIndex: 'po_no', render: (v) => <strong>{v}</strong> },
              { title: 'Supplier', dataIndex: 'supplier_name' },
              { title: 'For order', dataIndex: 'for_order_no', render: (v, r) => (v ? <Link to={`/app/orders/${r.for_order_id}`} onClick={(e) => e.stopPropagation()}>{v}</Link> : '–') },
              { title: 'Lines', dataIndex: 'line_count', width: 70 },
              ...(session.can('orders.view_price') ? [{ title: 'Total', dataIndex: 'total', align: 'right', render: money }] : []),
              { title: 'Need by', dataIndex: 'need_by', render: date },
              { title: 'Status', dataIndex: 'status', render: (v) => <PoStatus value={v} /> },
            ]} />
        </QueryState>
      </section>
      {creating && <NewPurchaseOrder orderId={params.get('order')} onClose={closeNew} onCreated={(id) => { closeNew(); setOpenId(id); }} />}
      <PurchaseOrderDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/** New PO popup. With ?order=<id> it starts from that order's shortage list. Only ✕ / Cancel close it. */
function NewPurchaseOrder({ orderId, onClose, onCreated }) {
  const session = useSession();
  const act = useAction({ success: 'Purchase order saved as a draft' });
  const [form] = Form.useForm();
  const [modal, holder] = Modal.useModal();
  const req = useGet(`/orders/${orderId}/requirements`, undefined, { enabled: !!orderId });

  useEffect(() => {
    const buy = req.payload?.summary?.buy_list;
    if (orderId && buy?.length) {
      form.setFieldsValue({ for_order_id: orderId, lines: buy.map((b) => ({ item_id: b.item_id, qty: Number(b.qty), rate: Number(b.est_rate || 0) })) });
    }
  }, [req.payload, orderId, form]);

  function close() {
    if (!form.isFieldsTouched() && !orderId) { onClose(); return; }
    modal.confirm({ title: 'Discard this purchase order?', okText: 'Discard', okButtonProps: { danger: true }, cancelText: 'Keep editing', onOk: onClose });
  }

  function submit(v) {
    act.mutate(
      { path: '/purchase-orders', body: clean({ ...v, notes: v.notes || undefined, lines: v.lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: Number(l.rate || 0) })) }) },
      { onSuccess: (res) => onCreated(res.data.id) },
    );
  }

  return (
    <Modal open title="New purchase order" width={900} maskClosable={false} keyboard={false} onCancel={close} footer={null} destroyOnClose className="order-modal">
      {holder}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ lines: [{ qty: 1, rate: 0 }] }}>
        <div className="form-grid">
          <Form.Item name="supplier_contact_id" label="Supplier" rules={[{ required: true, message: 'Choose the supplier' }]}><RemoteSelect from={{ path: '/contacts', params: { type: 'supplier' } }} /></Form.Item>
          <Form.Item name="need_by" label="Need by"><Input type="date" /></Form.Item>
          <Form.Item name="for_order_id" label="For buyer order (optional)"><RemoteSelect from={{ path: '/orders', label: 'order_no' }} /></Form.Item>
        </div>
        <h3>Items</h3>
        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <div className="order-line" key={f.key}>
                  <Form.Item name={[f.name, 'item_id']} label="Item" rules={[{ required: true, message: 'Choose the item' }]}><RemoteSelect from={{ path: '/items' }} /></Form.Item>
                  <Form.Item name={[f.name, 'qty']} label="Quantity" rules={[{ required: true, type: 'number', min: 0.001, message: 'More than 0' }]}><InputNumber min={0.001} /></Form.Item>
                  {session.can('orders.view_price') && <Form.Item name={[f.name, 'rate']} label="Rate (INR)"><InputNumber min={0} /></Form.Item>}
                  <Button danger disabled={fields.length === 1} onClick={() => remove(f.name)}>Remove</Button>
                </div>
              ))}
              <Button onClick={() => add({ qty: 1, rate: 0 })}>+ Add item</Button>
            </>
          )}
        </Form.List>
        <Form.Item name="notes" label="Notes" style={{ marginTop: 16 }}><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <div className="order-modal-actions">
          <Space><Button onClick={close}>Cancel</Button><Button type="primary" htmlType="submit" size="large" loading={act.isPending}>Save draft</Button></Space>
        </div>
      </Form>
    </Modal>
  );
}

/** One PO: lines and the next step for its status. */
function PurchaseOrderDrawer({ id, onClose }) {
  const session = useSession();
  const navigate = useNavigate();
  const po = useGet(`/purchase-orders/${id}`, undefined, { enabled: !!id });
  const act = useAction({ success: 'Purchase order updated' });
  const [replying, setReplying] = useState(false);
  const [replyForm] = Form.useForm();
  const p = po.payload;
  const post = (step, body, done) => act.mutate({ path: `/purchase-orders/${id}/${step}`, body }, { onSuccess: done });

  return (
    <Drawer open={!!id} onClose={onClose} width={Math.min(720, window.innerWidth)} title={p ? <Space>{p.po_no}<PoStatus value={p.status} /></Space> : 'Purchase order'}
      extra={p && (
        <Space wrap>
          {p.status === 'draft' && !p.approved_at && session.can('po.approve') && <Button onClick={() => post('approve')}>Approve</Button>}
          {p.status === 'draft' && session.can('po.update') && <Popconfirm title="Mark this purchase order as sent to the supplier?" onConfirm={() => post('send')}><Button type="primary">Send</Button></Popconfirm>}
          {p.status === 'sent' && session.can('po.update') && <Button type="primary" onClick={() => { replyForm.resetFields(); setReplying(true); }}>Record supplier reply</Button>}
          {['draft', 'sent'].includes(p.status) && session.can('po.delete') && <Popconfirm title="Cancel this purchase order?" onConfirm={() => post('cancel')}><Button danger>Cancel PO</Button></Popconfirm>}
        </Space>
      )}>
      <QueryState query={po}>
        {p && (
          <>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: 16 }} items={[
              { key: 's', label: 'Supplier', children: p.supplier_name },
              { key: 'o', label: 'For order', children: p.for_order_no ? <a onClick={() => navigate(`/app/orders/${p.for_order_id}`)}>{p.for_order_no}</a> : '–' },
              { key: 'n', label: 'Need by', children: date(p.need_by) },
              { key: 'p', label: 'Supplier promised', children: date(p.promise_date) },
              { key: 'a', label: 'Approved', children: p.approved_at ? date(p.approved_at) : 'Not yet' },
              { key: 'r', label: 'Supplier note', children: p.response_note || '–' },
              ...(p.notes ? [{ key: 'x', label: 'Notes', children: p.notes }] : []),
            ]} />
            <Table rowKey="id" size="small" pagination={false} dataSource={p.lines} scroll={{ x: 520 }}
              columns={[
                { title: 'Item', dataIndex: 'description' },
                { title: 'Ordered', dataIndex: 'qty', align: 'right', render: (v, r) => `${quantity(v)} ${r.uom}` },
                { title: 'Accepted', dataIndex: 'accepted_qty', align: 'right', render: (v) => (v == null ? '–' : quantity(v)) },
                { title: 'Received', dataIndex: 'received_qty', align: 'right', render: quantity },
                ...(session.can('orders.view_price') ? [{ title: 'Rate', dataIndex: 'rate', align: 'right', render: money }] : []),
              ]} />
          </>
        )}
      </QueryState>

      <Modal open={replying} title="Supplier reply" maskClosable={false} onCancel={() => setReplying(false)} onOk={() => replyForm.submit()} okText="Save" confirmLoading={act.isPending}>
        <Form form={replyForm} layout="vertical" requiredMark={false} initialValues={{ action: 'accept' }}
          onFinish={(v) => post('respond', clean({
            action: v.action, promise_date: v.promise_date, note: v.note,
            lines: v.action === 'partial' ? p.lines.map((l) => ({ po_line_id: l.id, accepted_qty: Number(v.accepted?.[l.id] ?? 0) })) : undefined,
          }), () => setReplying(false))}>
          <Form.Item name="action" label="The supplier">
            <Radio.Group optionType="button" options={[{ value: 'accept', label: 'Accepted all' }, { value: 'partial', label: 'Accepted part' }, { value: 'reject', label: 'Rejected' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.action !== b.action}>
            {({ getFieldValue }) => getFieldValue('action') === 'partial' && p?.lines.map((l) => (
              <Form.Item key={l.id} name={['accepted', l.id]} label={`${l.description}: accepted (of ${quantity(l.qty)} ${l.uom})`} rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} max={Number(l.qty)} style={{ width: '100%' }} />
              </Form.Item>
            ))}
          </Form.Item>
          <Form.Item name="promise_date" label="Promised delivery date"><Input type="date" /></Form.Item>
          <Form.Item name="note" label="Note"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
