import { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, Select, Tabs, Alert, Descriptions, Popconfirm, Typography, message } from 'antd';
import { UserAddOutlined, EditOutlined, MailOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { useMill } from '@/hooks/useMill';

const list = (r) => (Array.isArray(r.data) ? r.data : []);
const opts = (rows, label = 'name') => rows.map((x) => ({ value: x.id, label: x[label] ?? x.code ?? x.id }));

const SCOPES = [
  { name: 'stage_ids', label: 'Only these stages', path: '/stages' },
  { name: 'machine_ids', label: 'Only these machines', path: '/machines' },
  { name: 'shift_ids', label: 'Only these shifts', path: '/shifts' },
  { name: 'warehouse_ids', label: 'Only these warehouses', path: '/warehouses' },
];

function ScopeFields({ enabled }) {
  const qs = SCOPES.map((s) => ({
    ...s,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    q: useQuery({ queryKey: [s.path], queryFn: () => api.get(s.path).then(list), enabled }),
  }));
  return (
    <>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Optional: leave empty to give access to the whole mill.
      </Typography.Text>
      {qs.map((s) => (
        <Form.Item key={s.name} name={['scope', s.name]} label={s.label}>
          <Select mode="multiple" allowClear loading={s.q.isLoading} options={opts(s.q.data ?? [], s.name === 'machine_ids' ? 'code' : 'name')} optionFilterProp="label" />
        </Form.Item>
      ))}
    </>
  );
}

export default function StaffPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const { role: me, user: meUser } = useMill();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sent, setSent] = useState(null);
  const [inviteForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const staffQ = useQuery({ queryKey: ['staff'], queryFn: () => api.get('/staff').then((r) => r.data) });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles').then(list) });
  const workersQ = useQuery({ queryKey: ['workers', 'active'], queryFn: () => api.get('/workers?active=true').then(list), enabled: !!editing });

  const members = staffQ.data?.members ?? [];
  const invites = staffQ.data?.invites ?? [];
  // you can only invite into roles ranked below your own
  const inviteRoles = (rolesQ.data ?? []).filter((r) => r.rank < (me?.rank ?? 0));
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff'] });

  const invite = useMutation({
    mutationFn: (v) => api.post('/staff/invites', v).then((r) => r.data),
    onSuccess: (res) => {
      setInviteOpen(false);
      inviteForm.resetFields();
      setSent(res);
      refresh();
    },
    onError: (e) => message.error(e.message || 'Could not send the invite'),
  });

  const resend = useMutation({
    mutationFn: (id) => api.post(`/staff/invites/${id}/resend`).then((r) => r.data),
    onSuccess: (res) => { setSent(res); refresh(); },
    onError: (e) => message.error(e.message || 'Could not resend the invite'),
  });

  const revoke = useMutation({
    mutationFn: (id) => api.delete(`/staff/invites/${id}`),
    onSuccess: () => { message.success('Invite cancelled'); refresh(); },
    onError: (e) => message.error(e.message || 'Could not cancel the invite'),
  });

  const patch = useMutation({
    mutationFn: ({ id, ...v }) => api.patch(`/staff/${id}`, v),
    onSuccess: () => { message.success('Saved'); setEditing(null); refresh(); },
    onError: (e) => message.error(e.message || 'Could not save'),
  });

  const openEdit = (m) => {
    setEditing(m);
    editForm.setFieldsValue({ role_id: m.role_id, status: m.status, worker_id: m.worker_id ?? null, scope: m.scope ?? {} });
  };

  const memberCols = [
    { title: 'Name', dataIndex: 'full_name', render: (v, r) => <strong>{v || r.email}</strong> },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Phone', dataIndex: 'phone', render: (v) => v || '–' },
    { title: 'Role', dataIndex: 'role', render: (v, r) => <Tag color={r.rank === 100 ? 'gold' : 'blue'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'active' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: '',
      key: 'a',
      width: 80,
      render: (_, r) =>
        can('staff.edit_role') && r.rank < (me?.rank ?? 0) && r.id !== meUser?.id
          ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          : null,
    },
  ];

  const inviteCols = [
    { title: 'Email', dataIndex: 'email' },
    { title: 'Role', dataIndex: 'role', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'Expires', dataIndex: 'expires_at', render: (v) => new Date(v).toLocaleString() },
    {
      title: '',
      key: 'a',
      width: 220,
      render: (_, r) => can('staff.invite') && (
        <Space>
          <Button size="small" icon={<MailOutlined />} loading={resend.isPending && resend.variables === r.id} onClick={() => resend.mutate(r.id)}>Resend</Button>
          <Popconfirm title="Cancel this invite?" onConfirm={() => revoke.mutate(r.id)}>
            <Button size="small" danger>Cancel</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Invite people by email. They set their own password and fill in their details."
        actions={can('staff.invite') && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>Invite staff</Button>
        )}
      />

      <Tabs
        items={[
          {
            key: 'members',
            label: `Members (${members.length})`,
            children: (
              <Table
                rowKey="id"
                size="middle"
                loading={staffQ.isLoading}
                dataSource={members}
                columns={memberCols}
                pagination={false}
                expandable={{
                  expandedRowRender: (m) => (
                    <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                      <Descriptions.Item label="Address">{m.address || '–'}</Descriptions.Item>
                      <Descriptions.Item label="City">{m.city || '–'}</Descriptions.Item>
                      <Descriptions.Item label="Emergency contact">{m.emergency_contact || '–'}</Descriptions.Item>
                      <Descriptions.Item label="Linked worker">{m.worker_name || '–'}</Descriptions.Item>
                    </Descriptions>
                  ),
                }}
              />
            ),
          },
          {
            key: 'invites',
            label: `Pending invites (${invites.length})`,
            children: <Table rowKey="id" size="middle" dataSource={invites} columns={inviteCols} pagination={false} />,
          },
        ]}
      />

      {/* invite */}
      <Modal
        title="Invite staff"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => inviteForm.submit()}
        okText="Send invite"
        confirmLoading={invite.isPending}
        destroyOnClose
      >
        <Form form={inviteForm} layout="vertical" requiredMark={false} onFinish={(v) => invite.mutate(v)}>
          <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
            <Input placeholder="person@example.com" />
          </Form.Item>
          <Form.Item
            name="role_id"
            label="Role"
            extra={inviteRoles.length === 0 && !rolesQ.isLoading ? 'No roles yet. Create one in Settings → Roles first.' : undefined}
            rules={[{ required: true, message: 'Choose a role' }]}
          >
            <Select loading={rolesQ.isLoading} options={inviteRoles.map((r) => ({ value: r.id, label: `${r.name} (${r.permissions.length} permissions)` }))} />
          </Form.Item>
          <ScopeFields enabled={inviteOpen} />
        </Form>
      </Modal>

      {/* edit member */}
      <Modal
        title={editing ? `Edit ${editing.full_name || editing.email}` : ''}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        okText="Save"
        confirmLoading={patch.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" requiredMark={false} onFinish={(v) => patch.mutate({ id: editing.id, ...v })}>
          <Form.Item name="role_id" label="Role">
            <Select options={inviteRoles.map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (cannot log in)' }]} />
          </Form.Item>
          <Form.Item name="worker_id" label="Linked worker" extra="Connects this login to a worker record, so floor work is recorded against them.">
            <Select allowClear showSearch optionFilterProp="label" loading={workersQ.isLoading}
              options={(workersQ.data ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.emp_code})` }))} />
          </Form.Item>
          <ScopeFields enabled={!!editing} />
        </Form>
      </Modal>

      {/* result of sending / resending */}
      <Modal title="Invite created" open={!!sent} onCancel={() => setSent(null)} footer={<Button type="primary" onClick={() => setSent(null)}>Done</Button>}>
        {sent && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {sent.email_sent
              ? <Alert type="success" showIcon message={`Email sent to ${sent.email}`} />
              : <Alert type="warning" showIcon message="The email was not sent" description="Email is not set up (or failed). Copy the link below and send it to the person yourself." />}
            <Typography.Text type="secondary">Role: {sent.role}. The link works for 7 days.</Typography.Text>
            <Typography.Paragraph copyable={{ text: sent.link }} style={{ wordBreak: 'break-all', marginBottom: 0 }}>{sent.link}</Typography.Paragraph>
          </Space>
        )}
      </Modal>
    </div>
  );
}
