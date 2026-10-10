import { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, Switch, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';

export default function MachinesPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [form] = Form.useForm();

  // Machines list: GET /machines
  const machinesQ = useQuery({
    queryKey: ['machines'],
    queryFn: () => api.get('/machines').then((r) => r.data?.rows || r.data || []),
  });

  // Stages dropdown: GET /stages
  const stagesQ = useQuery({
    queryKey: ['stages'],
    queryFn: () => api.get('/stages').then((r) => r.data?.rows || r.data || []),
  });

  const machines = Array.isArray(machinesQ.data) ? machinesQ.data : [];
  const stages = Array.isArray(stagesQ.data) ? stagesQ.data : [];

  const saveMutation = useMutation({
    mutationFn: (values) => {
      if (editingMachine) {
        return api.put(`/machines/${editingMachine.id}`, values);
      }
      return api.post('/machines', values);
    },
    onSuccess: () => {
      message.success(`Machine ${editingMachine ? 'updated' : 'created'} successfully`);
      setModalOpen(false);
      setEditingMachine(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['machines'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Failed to save machine'),
  });

  const openEdit = (machine) => {
    setEditingMachine(machine);
    form.setFieldsValue({
      code: machine.code,
      name: machine.name,
      stage_id: machine.stage_id,
      capacity_per_hour: machine.capacity_per_hour,
      capacity_uom: machine.capacity_uom,
      hourly_overhead: machine.hourly_overhead,
      active: machine.active,
    });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', render: (v) => <strong>{v}</strong>, width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 140 },
    {
      title: 'Capacity / Hr',
      key: 'cap',
      render: (_, r) => `${r.capacity_per_hour || '-'} ${r.capacity_uom || ''}`,
      width: 140,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <StatusBadge status={v || 'idle'} />,
      width: 130,
    },
    {
      title: 'Active',
      dataIndex: 'active',
      key: 'active',
      render: (v) => (v ? <Tag color="success">Active</Tag> : <Tag color="default">Inactive</Tag>),
      width: 100,
    },
    ...(can(P.SETTINGS_MANAGE)
      ? [
          {
            title: '',
            key: 'edit',
            render: (_, r) => (
              <Button size="small" onClick={() => openEdit(r)}>
                Edit
              </Button>
            ),
            width: 80,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Machines Master"
        subtitle="Configure production floor machinery"
        actions={[
          can(P.SETTINGS_MANAGE) && (
            <Button
              key="add"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingMachine(null);
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ background: '#006B73' }}
            >
              Add Machine
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => machinesQ.refetch()}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={machines}
          columns={columns}
          rowKey="id"
          loading={machinesQ.isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      <Modal
        title={editingMachine ? `Edit Machine — ${editingMachine.code}` : 'Add New Machine'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingMachine(null);
        }}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        confirmLoading={saveMutation.isPending}
        okText={editingMachine ? 'Save Changes' : 'Create Machine'}
      >
        <Form form={form} layout="vertical" initialValues={{ active: true, capacity_uom: 'm' }}>
          <Form.Item name="code" label="Machine Code" rules={[{ required: true, message: 'Code required' }]}>
            <Input placeholder="e.g. W-01, S-02" />
          </Form.Item>
          <Form.Item name="name" label="Machine Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Airjet Loom #1" />
          </Form.Item>
          <Form.Item name="stage_id" label="Production Stage" rules={[{ required: true, message: 'Stage required' }]}>
            <Select
              placeholder="Select stage"
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="capacity_per_hour" label="Capacity per Hour">
            <InputNumber min={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="capacity_uom" label="Capacity Unit">
            <Select options={[{ value: 'm', label: 'm' }, { value: 'kg', label: 'kg' }]} />
          </Form.Item>
          <Form.Item name="active" label="Active Status" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
