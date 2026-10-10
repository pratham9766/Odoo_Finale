import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { useSession } from '@/context/Session';
export default function OrderMasters() {
  const session = useSession();
  const cache = useQueryClient();
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [form] = Form.useForm();
  function open(value) { form.resetFields(); setError(null); setMode(value); }
  async function save(values) {
    setBusy(true); setError(null);
    try {
      await session.api(mode === 'buyer' ? '/contacts' : '/items', { method: 'POST', body: mode === 'buyer' ? { ...values, type: 'buyer' } : { ...values, kind: 'finished_fabric' } });
      await cache.invalidateQueries({ queryKey: [session.userId, mode === 'buyer' ? 'buyers' : 'items'] });
      setMode(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <><Space className="mb-4" wrap>{session.can('contacts.create') && <Button onClick={() => open('buyer')}>+ Add buyer</Button>}{session.can('items.create') && <Button onClick={() => open('item')}>+ Add fabric</Button>}</Space><Modal title={mode === 'buyer' ? 'Add buyer' : 'Add finished fabric'} open={!!mode} onCancel={() => !busy && setMode(null)} footer={null} destroyOnClose>{error && <Alert className="mb-4" type="error" message={error} />}<Form form={form} layout="vertical" onFinish={save} initialValues={{ uom: 'm', std_rate: 0, reorder_level: 0 }}><Form.Item name="name" label={mode === 'buyer' ? 'Buyer name' : 'Fabric name'} rules={[{required:true, whitespace:true,max:160}]}><Input maxLength={160} /></Form.Item>{mode === 'buyer' ? <Form.Item name="city" label="City"><Input maxLength={80} /></Form.Item> : <><Form.Item name="colour" label="Colour"><Input maxLength={50} /></Form.Item><Form.Item name="uom" label="Unit" rules={[{required:true}]}><Select options={['m','kg','roll','pcs'].map(value => ({value,label:value}))} /></Form.Item><Form.Item name="std_rate" label="Standard rate (INR)" rules={[{required:true,type:'number',min:0}]}><InputNumber min={0} precision={2} /></Form.Item><Form.Item name="reorder_level" label="Reorder level" rules={[{required:true,type:'number',min:0}]}><InputNumber min={0} /></Form.Item></>}<Button type="primary" htmlType="submit" loading={busy}>Save {mode === 'buyer' ? 'buyer' : 'fabric'}</Button></Form></Modal></>;
}
