import { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import { useSession } from '@/context/Session';
import { PageTitle, QueryState } from '@/components/States';
import { clean, useAction, useGet } from '@/lib/hooks';

/** a select whose options come from the API: { path, label: 'name', value: 'id', params } */
export function RemoteSelect({ from, value, onChange, allowClear = true, ...rest }) {
  const q = useGet(from.path, { limit: 100, ...from.params });
  const options = (q.payload || []).map((row) => ({ value: row[from.value || 'id'], label: typeof from.label === 'function' ? from.label(row) : row[from.label || 'name'] }));
  return <Select showSearch optionFilterProp="label" allowClear={allowClear} loading={q.isLoading} options={options} value={value} onChange={onChange} {...rest} />;
}

function Control({ field }) {
  if (field.from) return <RemoteSelect from={field.from} mode={field.multiple ? 'multiple' : undefined} />;
  switch (field.type) {
    case 'textarea': return <Input.TextArea rows={2} />;
    case 'number': return <InputNumber min={field.min} max={field.max} step={field.step} precision={field.precision} style={{ width: '100%' }} />;
    case 'select': return <Select allowClear options={field.options} />;
    case 'switch': return <Switch />;
    case 'date': return <Input type="date" />;
    default: return <Input maxLength={field.max} />;
  }
}

/**
 * One master-data screen: a table plus an add / edit form, driven by config.
 *   path           list endpoint (create posts to it, edit sends to path/:id)
 *   perms          { create, update, remove } permission keys; an action without permission is not shown
 *   updateMethod   PATCH for the generic CRUD routes, PUT for items / contacts / BOMs
 *   fields         [{ name, label, type, required, options, from, help, initial, createOnly }]
 *   body           (values, row?) => request body (default: the form values without empty strings)
 *   toForm         (row) => form values when editing
 */
export default function CrudPage({
  eyebrow = 'SETUP', title, description, path, params, perms = {}, updateMethod = 'PATCH', columns, fields,
  body, toForm, noun = 'record', search = false, extraActions, embedded = false,
}) {
  const session = useSession();
  const act = useAction();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // null closed, {} new, row = edit
  const [form] = Form.useForm();
  const list = useGet(path, { limit: 100, q: q || undefined, ...params });
  const rows = list.payload || [];
  const isNew = editing && !editing.id;

  function openForm(row) {
    setEditing(row || {});
    form.resetFields();
    const defaults = Object.fromEntries(fields.filter((f) => f.initial !== undefined).map((f) => [f.name, f.initial]));
    form.setFieldsValue(row ? (toForm ? toForm(row) : Object.fromEntries(fields.map((f) => [f.name, row[f.name]]))) : defaults);
  }

  function submit(values) {
    const edit = !isNew;
    const payload = body ? body(values, edit ? editing : null) : clean(values);
    act.mutate(
      { method: edit ? updateMethod : 'POST', path: edit ? `${path}/${editing.id}` : path, body: payload },
      { onSuccess: () => setEditing(null) },
    );
  }

  const actionColumn = (perms.update || perms.remove || extraActions) && {
    title: '', key: 'actions', width: 170,
    render: (_, row) => (
      <Space>
        {extraActions?.(row)}
        {perms.update && session.can(perms.update) && <Button size="small" onClick={() => openForm(row)}>Edit</Button>}
        {perms.remove && session.can(perms.remove) && (
          <Popconfirm title={`Delete this ${noun}?`} onConfirm={() => act.mutate({ method: 'DELETE', path: `${path}/${row.id}` })}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        )}
      </Space>
    ),
  };

  const content = (
    <>
      <section className="panel">
        {search && <Input.Search allowClear placeholder={`Search ${noun}s`} style={{ maxWidth: 320, marginBottom: 12 }} onSearch={setQ} />}
        <QueryState query={list}>
          <Table rowKey="id" size="middle" columns={[...columns, ...(actionColumn ? [actionColumn] : [])]} dataSource={rows} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
        </QueryState>
      </section>

      <Modal title={isNew ? `Add ${noun}` : `Edit ${noun}`} open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save" confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          {fields.filter((f) => !(f.createOnly && !isNew)).map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label} extra={f.help} valuePropName={f.type === 'switch' ? 'checked' : 'value'}
              rules={f.required ? [{ required: true, message: `${f.label} is required` }] : undefined}>
              <Control field={f} />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </>
  );
  if (embedded) return <>{perms.create && session.can(perms.create) && <div style={{ marginBottom: 12 }}><Button type="primary" onClick={() => openForm()}>Add {noun}</Button></div>}{content}</>;
  return (
    <>
      <PageTitle eyebrow={eyebrow} title={title} description={description} action={perms.create && session.can(perms.create) && <Button type="primary" onClick={() => openForm()}>Add {noun}</Button>} />
      {content}
    </>
  );
}

export const yesNo = (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'No'}</Tag>;
