// Create-order page: a thin wrapper that submits the order form and opens the new order.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Select, Space } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { PageTitle } from '@/components/States';
import { validateLines } from '@/lib/order';
import OrderMasters from './OrderMasters';

export default function CreateOrder() {
  const session = useSession();
  const [form] = Form.useForm();
  const [error, setError] = useState(null);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const cache = useQueryClient();
  const navigate = useNavigate();
  const buyers = useQuery({ queryKey: [session.userId,'buyers',buyerSearch], queryFn: ({ signal }) => session.api(`/contacts?type=buyer&page=1&limit=100&q=${encodeURIComponent(buyerSearch)}`, { signal }) });
  const items = useQuery({ queryKey: [session.userId,'items',itemSearch], queryFn: ({ signal }) => session.api(`/items?page=1&limit=100&q=${encodeURIComponent(itemSearch)}`, { signal }) });
  const save = useMutation({ mutationFn: body => session.api('/orders', { method: 'POST', body }), onSuccess: async result => { await cache.invalidateQueries({ queryKey: [session.userId,'orders'] }); navigate(`/app/orders/${result.data.id}`); }, onError: err => setError(err.message) });
  function submit(values) {
    setError(null);
    const invalid = validateLines(values.lines);
    if (invalid) { setError(invalid); return; }
    save.mutate({ ...values, lines: values.lines.map(line => ({ ...line, qty: Number(line.qty), ...(session.can('orders.view_price') ? { rate: Number(line.rate || 0) } : {}) })) });
  }
  return <><PageTitle title="Create order" description="Capture the buyer, delivery commitment and fabric requirements." /><section className="panel form-panel"><OrderMasters />{error && <Alert className="mb-4" type="error" showIcon message="Order was not saved" description={error} />}{(buyers.isError || items.isError) && <Alert className="mb-4" type="error" message="Could not load buyers or items" description="Check the API connection, then retry. Your form entries are retained." action={<Button onClick={() => { buyers.refetch(); items.refetch(); }}>Retry</Button>} />}<Form form={form} layout="vertical" onFinish={submit} initialValues={{ priority: 'normal', lines: [{ qty: 1, rate: 0 }] }}><div className="form-grid"><Form.Item name="buyer_contact_id" label="Buyer" rules={[{ required: true, message: 'Select a buyer.' }]}><Select showSearch filterOption={false} onSearch={setBuyerSearch} loading={buyers.isFetching} placeholder="Search buyers" options={(buyers.data?.data || []).map(item => ({ value: item.id, label: item.name }))} /></Form.Item><Form.Item name="deadline" label="Delivery deadline" rules={[{ required: true, message: 'Choose a delivery date.' }]}><Input type="date" /></Form.Item><Form.Item name="priority" label="Priority"><Select options={['low','normal','high','urgent'].map(value => ({ value, label: value }))} /></Form.Item></div><h2>Order lines</h2><Form.List name="lines">{(fields,{ add, remove }) => <>{fields.map(field => <div className="order-line" key={field.key}><Form.Item name={[field.name,'item_id']} label="Fabric / item" rules={[{ required: true }]}><Select showSearch filterOption={false} onSearch={setItemSearch} loading={items.isFetching} placeholder="Search catalog" options={(items.data?.data || []).map(item => ({ value: item.id, label: item.name }))} onChange={id => { const item = items.data?.data.find(row => row.id === id); form.setFieldValue(['lines',field.name,'uom'], item?.uom); form.setFieldValue(['lines',field.name,'colour'], item?.colour || ''); if (session.can('orders.view_price')) form.setFieldValue(['lines',field.name,'rate'], Number(item?.std_rate || 0)); }} /></Form.Item><Form.Item name={[field.name,'colour']} label="Colour"><Input maxLength={50} /></Form.Item><Form.Item name={[field.name,'qty']} label="Quantity" rules={[{ required: true, type: 'number', min: 0.001 }]}><InputNumber min={0.001} precision={3} /></Form.Item><Form.Item name={[field.name,'uom']} label="Unit" rules={[{ required: true }]}><Select options={['m','kg','roll','pcs'].map(value => ({ value, label: value }))} /></Form.Item>{session.can('orders.view_price') && <Form.Item name={[field.name,'rate']} label="Rate (INR)" rules={[{ type: 'number', min: 0 }]}><InputNumber min={0} precision={2} /></Form.Item>}<Button danger aria-label={`Remove line ${field.name + 1}`} disabled={fields.length === 1} onClick={() => remove(field.name)}>Remove</Button></div>)}<Button onClick={() => add({ qty: 1, rate: 0 })}>+ Add line</Button></>}</Form.List><Form.Item className="mt-6" name="notes" label="Notes"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item><Space><Button htmlType="submit" type="primary" size="large" loading={save.isPending} disabled={buyers.isError || items.isError || buyers.isPending || items.isPending}>Save draft order</Button><Link to="/app/orders">Cancel</Link></Space></Form></section></>;
}
