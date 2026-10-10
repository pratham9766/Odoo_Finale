import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { useSession } from '@/context/Session';
import { PageTitle, QueryState } from '@/components/States';
import { date } from '@/lib/format';

const SCOPES = [
  { name: 'stage_ids', label: 'Only these stages', path: '/stages', text: 'name' },
  { name: 'machine_ids', label: 'Only these machines', path: '/machines', text: 'code' },
  { name: 'shift_ids', label: 'Only these shifts', path: '/shifts', text: 'name' },
  { name: 'warehouse_ids', label: 'Only these warehouses', path: '/warehouses', text: 'name' },
];

/** Optional limits: a role can be restricted to some stages, machines, shifts or warehouses. Empty = the whole mill. */
function ScopeFields({ enabled }) {
  const session = useSession();
  const queries = SCOPES.map((s) => ({
    ...s,
    // fixed-length list, so hook order never changes
    // eslint-disable-next-line react-hooks/rules-of-hooks
    q: useQuery({ queryKey: [session.userId, 'scope', s.path], queryFn: ({ signal }) => session.api(`${s.path}?limit=100`, { signal }), enabled }),
  }));
  return (
    <>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Optional: leave empty to give access to the whole mill.</Typography.Text>
      {queries.map((s) => (
        <Form.Item key={s.name} name={['scope', s.name]} label={s.label}>
          <Select mode="multiple" allowClear loading={s.q.isLoading} optionFilterProp="label"
            options={(s.q.data?.data || []).map((x) => ({ value: x.id, label: x[s.text] }))} />
        </Form.Item>
      ))}
    </>
  );
}

export default function Staff() {
  const session = useSession();
  const cache = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sent, setSent] = useState(null);
  const [inviteForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const myRank = session.context.role.rank;

  const staff = useQuery({ queryKey: [session.userId, 'staff'], queryFn: ({ signal }) => session.api('/staff', { signal }) });
  const roles = useQuery({ queryKey: [session.userId, 'roles'], queryFn: ({ signal }) => session.api('/roles', { signal }) });
  const workers = useQuery({ queryKey: [session.userId, 'workers'], queryFn: ({ signal }) => session.api('/workers?limit=100', { signal }), enabled: !!editing && session.can('workers.view') });

  const members = staff.data?.data?.members || [];
  const invites = staff.data?.data?.invites || [];
  // you can only hand out roles ranked below your own
  const grantable = (roles.data?.data || []).filter((r) => r.rank < myRank);
  const refresh = () => cache.invalidateQueries({ queryKey: [session.userId, 'staff'] });

  const invite = useMutation({
    mutationFn: (body) => session.api('/staff/invites', { method: 'POST', body }),
    onSuccess: (res) => { setInviteOpen(false); inviteForm.resetFields(); setSent(res.data); refresh(); },
    onError: (e) => message.error(e.message),
  });
  const resend = useMutation({
    mutationFn: (id) => session.api(`/staff/invites/${id}/resend`, { method: 'POST' }),
    onSuccess: (res) => { setSent(res.data); refresh(); },
    onError: (e) => message.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id) => session.api(`/staff/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('Invite cancelled'); refresh(); },
    onError: (e) => message.error(e.message),
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }) => session.api(`/staff/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { message.success('Saved'); setEditing(null); refresh(); },
    onError: (e) => message.error(e.message),
  });

  const openEdit = (m) => {
    setEditing(m);
    editForm.setFieldsValue({ role_id: m.role_id, status: m.status, worker_id: m.worker_id ?? null, scope: m.scope ?? {} });
  };

  const memberColumns = [
    { title: 'Name', dataIndex: 'full_name', render: (v, r) => <strong>{v || r.email}</strong> },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Phone', dataIndex: 'phone', render: (v) => v || '–' },
    { title: 'Role', dataIndex: 'role', render: (v, r) => <Tag color={r.rank === 100 ? 'gold' : 'blue'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'active' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: '', key: 'a', width: 80,
      render: (_, r) => session.can('staff.update') && r.rank < myRank && r.id !== session.userId
        ? <Button size="small" onClick={() => openEdit(r)}>Edit</Button> : null,
    },
  ];

  const inviteColumns = [
    { title: 'Email', dataIndex: 'email' },
    { title: 'Role', dataIndex: 'role', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'Expires', dataIndex: 'expires_at', render: date },
    {
      title: '', key: 'a', width: 200,
      render: (_, r) => (
        <Space>
          {session.can('staff.create') && <Button size="small" loading={resend.isPending && resend.variables === r.id} onClick={() => resend.mutate(r.id)}>Resend</Button>}
          {session.can('staff.delete') && <Popconfirm title="Cancel this invite?" onConfirm={() => revoke.mutate(r.id)}><Button size="small" danger>Cancel</Button></Popconfirm>}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        eyebrow="ADMIN"
        title="Staff"
        description="Invite people by email. They set their own password and fill in their details."
        action={session.can('staff.create') && <Button type="primary" onClick={() => setInviteOpen(true)}>Invite staff</Button>}
      />
      <section className="panel">
        <QueryState query={staff}>
          <Tabs items={[
            {
              key: 'members', label: `Members (${members.length})`,
              children: (
                <Table
                  rowKey="id" columns={memberColumns} dataSource={members} pagination={false} scroll={{ x: 640 }}
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
            { key: 'invites', label: `Pending invites (${invites.length})`, children: <Table rowKey="id" columns={inviteColumns} dataSource={invites} pagination={false} scroll={{ x: 520 }} /> },
          ]} />
        </QueryState>
      </section>

      <Modal title="Invite staff" open={inviteOpen} onCancel={() => setInviteOpen(false)} onOk={() => inviteForm.submit()} okText="Send invite" confirmLoading={invite.isPending} destroyOnClose>
        <Form form={inviteForm} layout="vertical" requiredMark={false} onFinish={(v) => invite.mutate(v)}>
          <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}><Input placeholder="person@example.com" /></Form.Item>
          <Form.Item
            name="role_id" label="Role" rules={[{ required: true, message: 'Choose a role' }]}
            extra={!roles.isLoading && grantable.length === 0 ? 'No roles yet. Create one in Roles & permissions first.' : undefined}
          >
            <Select loading={roles.isLoading} options={grantable.map((r) => ({ value: r.id, label: `${r.name} (${r.permissions.length} permissions)` }))} />
          </Form.Item>
          <ScopeFields enabled={inviteOpen} />
        </Form>
      </Modal>

      <Modal title={editing ? `Edit ${editing.full_name || editing.email}` : ''} open={!!editing} onCancel={() => setEditing(null)} onOk={() => editForm.submit()} okText="Save" confirmLoading={patch.isPending} destroyOnClose>
        <Form form={editForm} layout="vertical" requiredMark={false} onFinish={(v) => patch.mutate({ id: editing.id, ...v })}>
          <Form.Item name="role_id" label="Role"><Select options={grantable.map((r) => ({ value: r.id, label: r.name }))} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (cannot log in)' }]} /></Form.Item>
          {session.can('workers.view') && (
            <Form.Item name="worker_id" label="Linked worker" extra="Connects this login to a worker record, so floor work is recorded against them.">
              <Select allowClear showSearch optionFilterProp="label" loading={workers.isLoading} options={(workers.data?.data || []).map((w) => ({ value: w.id, label: `${w.name} (${w.emp_code})` }))} />
            </Form.Item>
          )}
          <ScopeFields enabled={!!editing} />
        </Form>
      </Modal>

      <Modal title="Invite created" open={!!sent} onCancel={() => setSent(null)} footer={<Button type="primary" onClick={() => setSent(null)}>Done</Button>}>
        {sent && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {sent.email_sent
              ? <Alert type="success" showIcon message={`Email sent to ${sent.email}`} />
              : <Alert type="warning" showIcon message="The email was not sent" description="Email is not set up, or sending failed. Copy the link below and send it to the person yourself." />}
            <Typography.Text type="secondary">Role: {sent.role}. The link works for 7 days.</Typography.Text>
            <Typography.Paragraph copyable={{ text: sent.link }} style={{ wordBreak: 'break-all', marginBottom: 0 }}>{sent.link}</Typography.Paragraph>
          </Space>
        )}
      </Modal>
    </>
  );
}
