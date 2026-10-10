import { useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import { RemoteSelect } from '@/components/CrudPage';
import MaterialSummary from '@/components/MaterialSummary';
import { PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { useAction, useGet } from '@/lib/hooks';

/** quick answer to "do we have enough yarn for N metres of this fabric?" */
function MaterialCheck() {
  const [item, setItem] = useState();
  const [qty, setQty] = useState(100);
  const [asked, setAsked] = useState(null);
  const result = useGet('/bom/explode', asked || {}, { enabled: !!asked });
  return (
    <Card title="Material check" size="small" style={{ marginBottom: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <RemoteSelect from={{ path: '/items', params: { kind: 'finished_fabric' } }} value={item} onChange={setItem} placeholder="Choose a fabric" style={{ width: 260 }} />
        <InputNumber min={1} value={qty} onChange={setQty} addonAfter="m" />
        <Button type="primary" disabled={!item || !qty} onClick={() => setAsked({ item_id: item, qty })}>Check stock</Button>
      </Space>
      {asked && <QueryState query={result}><MaterialSummary summary={result.payload?.summary} /></QueryState>}
    </Card>
  );
}

export default function Boms() {
  const session = useSession();
  const act = useAction();
  const [editing, setEditing] = useState(null);   // {} new, bom = edit
  const [form] = Form.useForm();
  const list = useGet('/boms', { limit: 100 });
  const isNew = editing && !editing.id;

  async function open(bom) {
    form.resetFields();
    if (!bom) { form.setFieldsValue({ output_qty: 1, is_default: true, lines: [{ qty: 1, wastage_pct: 0 }] }); setEditing({}); return; }
    const detail = await session.api(`/boms/${bom.id}`);
    form.setFieldsValue(detail.data);
    setEditing(detail.data);
  }

  function submit(v) {
    const lines = v.lines.map((l) => ({ component_item_id: l.component_item_id, qty: l.qty, wastage_pct: l.wastage_pct ?? 0, share_label: l.share_label ?? null }));
    const body = { output_qty: v.output_qty ?? 1, is_default: v.is_default ?? true, notes: v.notes || undefined, lines, ...(isNew ? { output_item_id: v.output_item_id } : {}) };
    act.mutate({ method: isNew ? 'POST' : 'PUT', path: isNew ? '/boms' : `/boms/${editing.id}`, body }, { onSuccess: () => setEditing(null) });
  }

  return (
    <>
      <PageTitle eyebrow="MASTER DATA" title="Recipes (BOM)" description="How much of each yarn or material one metre or kilo of a product needs. The yarn check and order planning use these."
        action={session.can('bom.create') && <Button type="primary" onClick={() => open(null)}>New recipe</Button>} />
      {session.can('stock.view') && <MaterialCheck />}
      <section className="panel">
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} pagination={{ pageSize: 20, hideOnSinglePage: true }}
            columns={[
              { title: 'Product', dataIndex: 'output_name', render: (v) => <strong>{v}</strong> },
              { title: 'Makes', render: (_, r) => `${r.output_qty} ${r.output_uom}` },
              { title: 'Materials', dataIndex: 'line_count' },
              { title: 'Default', dataIndex: 'is_default', render: (v) => v && <Tag color="green">default</Tag> },
              { title: '', key: 'a', width: 160, render: (_, r) => (
                <Space>
                  {session.can('bom.update') && <Button size="small" onClick={() => open(r)}>Edit</Button>}
                  {session.can('bom.delete') && <Popconfirm title="Delete this recipe?" onConfirm={() => act.mutate({ method: 'DELETE', path: `/boms/${r.id}` })}><Button size="small" danger>Delete</Button></Popconfirm>}
                </Space>
              ) },
            ]} />
        </QueryState>
      </section>

      <Modal title={isNew ? 'New recipe' : `Edit recipe: ${editing?.output_name ?? ''}`} open={!!editing} width={760} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save" confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          <div className="form-grid">
            {isNew && <Form.Item name="output_item_id" label="Product made" rules={[{ required: true, message: 'Choose the product' }]}><RemoteSelect from={{ path: '/items' }} /></Form.Item>}
            <Form.Item name="output_qty" label="Quantity this recipe makes"><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="is_default" label="Default recipe" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <h3>Materials needed</h3>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="start" wrap style={{ display: 'flex' }}>
                    <Form.Item name={[f.name, 'component_item_id']} rules={[{ required: true, message: 'Choose a material' }]}><RemoteSelect from={{ path: '/items' }} placeholder="Material" style={{ width: 240 }} /></Form.Item>
                    <Form.Item name={[f.name, 'qty']} rules={[{ required: true }]}><InputNumber min={0.001} placeholder="Qty" /></Form.Item>
                    <Form.Item name={[f.name, 'wastage_pct']}><InputNumber min={0} max={99.9} placeholder="Wastage %" addonAfter="%" /></Form.Item>
                    <Form.Item name={[f.name, 'share_label']}><Select allowClear placeholder="Warp / weft" style={{ width: 120 }} options={[{ value: 'warp', label: 'Warp' }, { value: 'weft', label: 'Weft' }]} /></Form.Item>
                    <Button danger disabled={fields.length === 1} onClick={() => remove(f.name)}>Remove</Button>
                  </Space>
                ))}
                <Button onClick={() => add({ qty: 1, wastage_pct: 0 })}>+ Add material</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="notes" label="Notes" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
