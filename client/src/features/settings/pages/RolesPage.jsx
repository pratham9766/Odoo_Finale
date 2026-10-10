import { useMemo, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Checkbox, Collapse, Popconfirm, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { useMill } from '@/hooks/useMill';

const rows = (r) => (Array.isArray(r.data) ? r.data : []);
const titleCase = (s) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function RolesPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const { role: me } = useMill();
  const canManage = can('roles.manage');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles').then(rows) });
  const permsQ = useQuery({ queryKey: ['permissions'], queryFn: () => api.get('/permissions').then(rows) });

  const groups = useMemo(() => {
    const by = {};
    for (const p of permsQ.data ?? []) (by[p.domain] ??= []).push(p);
    return Object.entries(by);
  }, [permsQ.data]);

  const save = useMutation({
    mutationFn: (v) => (editing ? api.put(`/roles/${editing.id}`, v) : api.post('/roles', v)),
    onSuccess: () => {
      message.success(editing ? 'Role updated' : 'Role created');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => message.error(e.message || 'Could not save the role'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      message.success('Role deleted');
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => message.error(e.message || 'Could not delete the role'),
  });

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ rank: 50, permissions: [] });
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({ name: r.name, rank: r.rank, permissions: r.permissions });
    setOpen(true);
  };

  const columns = [
    { title: 'Role', dataIndex: 'name', render: (v, r) => <Space><strong>{v}</strong>{r.rank === 100 && <Tag color="gold">Owner</Tag>}</Space> },
    { title: 'Rank', dataIndex: 'rank', width: 90 },
    { title: 'Permissions', dataIndex: 'permissions', width: 130, render: (v, r) => (r.rank === 100 ? 'All' : v.length) },
    { title: 'People', dataIndex: 'members', width: 90 },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, r) => {
        const locked = r.rank === 100 || r.rank >= (me?.rank ?? 0);
        if (!canManage) return null;
        const why = r.rank === 100 ? 'The Owner role cannot be changed' : r.members > 0 ? `${r.members} people still have this role` : null;
        return (
          <Space>
            <Tooltip title={locked ? 'You cannot edit this role' : 'Edit'}>
              <Button size="small" icon={<EditOutlined />} disabled={locked} onClick={() => openEdit(r)} />
            </Tooltip>
            <Tooltip title={why ?? 'Delete'}>
              <Popconfirm title="Delete this role?" disabled={locked || r.members > 0} onConfirm={() => remove.mutate(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} disabled={locked || r.members > 0} />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const selected = Form.useWatch('permissions', form) ?? [];

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        subtitle="Create roles and choose exactly what each one can do. Then invite people into them from Staff."
        actions={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New role</Button>}
      />

      <Table rowKey="id" size="middle" loading={rolesQ.isLoading} dataSource={rolesQ.data ?? []} columns={columns} pagination={false} />

      <Modal
        title={editing ? `Edit role: ${editing.name}` : 'New role'}
        open={open}
        width={720}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Save changes' : 'Create role'}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark={false}>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="name" label="Role name" className="col-span-2" rules={[{ required: true, min: 2, message: 'Enter a role name' }]}>
              <Input placeholder="e.g. Shift Supervisor" />
            </Form.Item>
            <Form.Item
              name="rank"
              label="Rank (1–99)"
              tooltip="Higher rank = more senior. People can only invite others into roles ranked below their own."
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber min={1} max={99} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="permissions" label={`Permissions (${selected.length} selected)`} valuePropName="value" trigger="onChange">
            <PermissionPicker groups={groups} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function PermissionPicker({ groups, value = [], onChange }) {
  const set = new Set(value);
  const toggle = (keys, on) => {
    const next = new Set(value);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange([...next]);
  };

  return (
    <Collapse
      size="small"
      items={groups.map(([domain, perms]) => {
        const keys = perms.map((p) => p.key);
        const count = keys.filter((k) => set.has(k)).length;
        return {
          key: domain,
          label: <span><strong>{titleCase(domain)}</strong> <Tag>{count}/{keys.length}</Tag></span>,
          extra: (
            <Checkbox
              checked={count === keys.length}
              indeterminate={count > 0 && count < keys.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => toggle(keys, e.target.checked)}
            >
              All
            </Checkbox>
          ),
          children: (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {perms.map((p) => (
                <Checkbox key={p.key} checked={set.has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)}>
                  <span>{p.description || p.key}</span>
                  <span className="text-gray-400 text-xs ml-1">{p.key}</span>
                </Checkbox>
              ))}
            </div>
          ),
        };
      })}
    />
  );
}
