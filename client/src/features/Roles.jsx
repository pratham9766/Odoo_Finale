// Roles and permissions: create roles and tick exactly what each one may view, create, update and delete.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Tooltip, message } from 'antd';
import { useSession } from '@/context/Session';
import { PageTitle, QueryState } from '@/components/States';

const CRUD = ['view', 'create', 'update', 'delete'];

// readable names for the module part of a permission key (orders.view -> "orders")
const LABELS = {
  staff: 'Staff', roles: 'Roles', settings: 'Mill settings', contacts: 'Buyers & suppliers', items: 'Items', bom: 'BOMs',
  stock: 'Stock', receipt: 'Goods receipts (GRN)', po: 'Purchase orders', orders: 'Orders', production: 'Production',
  machine: 'Machine status', machines: 'Machines', assignment: 'Worker assignments', breakdown: 'Breakdowns',
  maintenance: 'Maintenance', qc: 'Quality (QC)', dispatch: 'Dispatch', invoice: 'Invoices', payment: 'Payments',
  expense: 'Expenses & bills', workers: 'Workers', attendance: 'Attendance', wages: 'Wages', reports: 'Reports',
};
const title = (s) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const label = (module) => LABELS[module] ?? title(module);

/** permissions -> one row per module: its view/create/update/delete boxes plus any other actions */
function toRows(permissions) {
  const modules = new Map();
  for (const p of permissions) {
    const [module, action] = p.key.split('.');
    if (!modules.has(module)) modules.set(module, { module, domain: p.domain, crud: {}, other: [] });
    const row = modules.get(module);
    if (CRUD.includes(action)) row.crud[action] = p;
    else row.other.push({ ...p, action });
  }
  return [...modules.values()];
}

function Matrix({ permissions, value = [], onChange }) {
  const rows = useMemo(() => toRows(permissions), [permissions]);
  const picked = new Set(value);
  const set = (keys, on) => {
    const next = new Set(value);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange([...next]);
  };
  const box = (p) => p
    ? <Tooltip title={p.description}><Checkbox checked={picked.has(p.key)} onChange={(e) => set([p.key], e.target.checked)} /></Tooltip>
    : <span style={{ color: '#c4c4c4' }}>–</span>;

  const columns = [
    { title: 'Area', dataIndex: 'domain', width: 110, render: (v, r, i) => (i === 0 || rows[i - 1].domain !== v ? <strong>{title(v)}</strong> : null) },
    {
      title: 'Module', dataIndex: 'module', width: 190,
      render: (m, r) => {
        const keys = [...CRUD.map((a) => r.crud[a]?.key), ...r.other.map((o) => o.key)].filter(Boolean);
        const all = keys.every((k) => picked.has(k));
        return <Checkbox checked={all} indeterminate={!all && keys.some((k) => picked.has(k))} onChange={(e) => set(keys, e.target.checked)}>{label(m)}</Checkbox>;
      },
    },
    ...CRUD.map((a) => ({ title: title(a), key: a, width: 70, align: 'center', render: (_, r) => box(r.crud[a]) })),
    {
      title: 'Other actions', key: 'other',
      render: (_, r) => (
        <Space size={[12, 2]} wrap>
          {r.other.map((o) => (
            <Tooltip key={o.key} title={o.description}>
              <Checkbox checked={picked.has(o.key)} onChange={(e) => set([o.key], e.target.checked)}>{title(o.action)}{o.confidential && <Tag style={{ marginLeft: 4 }}>sensitive</Tag>}</Checkbox>
            </Tooltip>
          ))}
        </Space>
      ),
    },
  ];
  return <Table size="small" rowKey="module" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 760, y: 420 }} />;
}

function MatrixField({ query, value, onChange }) {
  return <QueryState query={query}><Matrix permissions={query.data?.data || []} value={value} onChange={onChange} /></QueryState>;
}

export default function Roles() {
  const session = useSession();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const myRank = session.context.role.rank;

  const roles = useQuery({ queryKey: [session.userId, 'roles'], queryFn: ({ signal }) => session.api('/roles', { signal }) });
  const permissions = useQuery({ queryKey: [session.userId, 'permissions'], queryFn: ({ signal }) => session.api('/permissions', { signal }) });
  const refresh = () => cache.invalidateQueries({ queryKey: [session.userId, 'roles'] });

  const save = useMutation({
    mutationFn: (body) => session.api(editing ? `/roles/${editing.id}` : '/roles', { method: editing ? 'PUT' : 'POST', body }),
    onSuccess: () => { message.success(editing ? 'Role updated' : 'Role created'); setOpen(false); refresh(); },
    onError: (e) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => session.api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('Role deleted'); refresh(); },
    onError: (e) => message.error(e.message),
  });

  const openForm = (role) => {
    setEditing(role);
    form.setFieldsValue(role ? { name: role.name, rank: role.rank, permissions: role.permissions } : { name: '', rank: 50, permissions: [] });
    setOpen(true);
  };

  const columns = [
    { title: 'Role', dataIndex: 'name', render: (v, r) => <Space><strong>{v}</strong>{r.rank === 100 && <Tag color="gold">Owner</Tag>}</Space> },
    { title: 'Rank', dataIndex: 'rank', width: 80 },
    { title: 'Permissions', dataIndex: 'permissions', width: 120, render: (v, r) => (r.rank === 100 ? 'All' : v.length) },
    { title: 'People', dataIndex: 'members', width: 90 },
    {
      title: '', key: 'a', width: 150,
      render: (_, r) => {
        const locked = r.rank === 100 || r.rank >= myRank;
        return (
          <Space>
            {session.can('roles.update') && <Button size="small" disabled={locked} onClick={() => openForm(r)}>Edit</Button>}
            {session.can('roles.delete') && (
              <Tooltip title={r.members ? `${r.members} people still have this role` : undefined}>
                <Popconfirm title="Delete this role?" disabled={locked || r.members > 0} onConfirm={() => remove.mutate(r.id)}>
                  <Button size="small" danger disabled={locked || r.members > 0}>Delete</Button>
                </Popconfirm>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const selected = Form.useWatch('permissions', form) ?? [];

  return (
    <>
      <PageTitle
        title="Roles & permissions"
        description="Create roles and tick exactly what each one can view, create, update and delete. Then invite people into them from Staff."
        action={session.can('roles.create') && <Button type="primary" onClick={() => openForm(null)}>New role</Button>}
      />
      <section className="panel">
        <QueryState query={roles}>
          <Table rowKey="id" columns={columns} dataSource={roles.data?.data || []} pagination={false} scroll={{ x: 560 }} />
        </QueryState>
      </section>

      <Modal
        title={editing ? `Edit role: ${editing.name}` : 'New role'}
        open={open}
        width={980}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Save changes' : 'Create role'}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => save.mutate(v)}>
          <Space align="start" size="large" wrap>
            <Form.Item name="name" label="Role name" rules={[{ required: true, min: 2, message: 'Enter a role name' }]}><Input style={{ width: 280 }} placeholder="e.g. Shift Supervisor" /></Form.Item>
            <Form.Item name="rank" label="Rank (1–99)" tooltip="Higher rank = more senior. People can only invite others into roles ranked below their own." rules={[{ required: true, message: 'Required' }]}><InputNumber min={1} max={99} /></Form.Item>
          </Space>
          <Form.Item name="permissions" label={`Permissions (${selected.length} selected)`} valuePropName="value" trigger="onChange">
            <MatrixField query={permissions} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
