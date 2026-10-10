import { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, Switch, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';

export default function WorkersPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [form] = Form.useForm();

  // Workers list: GET /workers
  const workersQ = useQuery({
    queryKey: ['workers', 'all'],
    queryFn: () => api.get('/workers').then((r) => r.data?.rows || r.data || []),
  });

  // Stages dropdown: GET /stages
  const stagesQ = useQuery({
    queryKey: ['stages'],
    queryFn: () => api.get('/stages').then((r) => r.data?.rows || r.data || []),
  });

  // Shifts dropdown: GET /shifts
  const shiftsQ = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data?.rows || r.data || []),
  });

  const workers = Array.isArray(workersQ.data) ? workersQ.data : [];
  const stages = Array.isArray(stagesQ.data) ? stagesQ.data : [];
  const shifts = Array.isArray(shiftsQ.data) ? shiftsQ.data : [];

  const saveMutation = useMutation({
    mutationFn: (values) => {
      if (editingWorker) {
        return api.put(`/workers/${editingWorker.id}`, values);
      }
      return api.post('/workers', values);
    },
    onSuccess: () => {
      message.success(`Worker ${editingWorker ? 'updated' : 'registered'} successfully`);
      setModalOpen(false);
      setEditingWorker(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['workers'] });
    },
    onError: (err) => message.error(err.message || 'Failed to save worker'),
  });

  const openEdit = (worker) => {
    setEditingWorker(worker);
    form.setFieldsValue({
      emp_code: worker.emp_code,
      name: worker.name,
      phone: worker.phone,
      stage_id: worker.stage_id,
      default_shift_id: worker.default_shift_id,
      wage_type: worker.wage_type || 'daily',
      rate: Number(worker.rate || 0),
      piece_rate: Number(worker.piece_rate || 0),
      employment_type: worker.employment_type || 'permanent',
      active: worker.active !== false,
    });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Emp Code', dataIndex: 'emp_code', key: 'emp_code', render: (v) => <strong>{v}</strong>, width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 140 },
    { title: 'Default Shift', dataIndex: 'shift', key: 'shift', width: 140 },
    {
      title: 'Wage Type',
      dataIndex: 'wage_type',
      key: 'wage_type',
      render: (v, r) => (
        <span>
          <Tag color="blue">{v?.toUpperCase()}</Tag> ₹{r.rate || r.piece_rate || 0}
        </span>
      ),
      width: 160,
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      render: (v) => (v ? <Tag color="success">Active</Tag> : <Tag color="default">Inactive</Tag>),
      width: 100,
    },
    ...(can(P.WORKERS_MANAGE)
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
        title="Mill Workers"
        subtitle="Manage operators, technicians and wage rates"
        actions={[
          can(P.WORKERS_MANAGE) && (
            <Button
              key="add"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingWorker(null);
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ background: '#006B73' }}
            >
              Add Worker
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => workersQ.refetch()}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={workers}
          columns={columns}
          rowKey="id"
          loading={workersQ.isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      <Modal
        title={editingWorker ? `Edit Worker — ${editingWorker.name}` : 'Register New Worker'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingWorker(null);
        }}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        confirmLoading={saveMutation.isPending}
        okText={editingWorker ? 'Save Changes' : 'Register Worker'}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            wage_type: 'daily',
            employment_type: 'permanent',
            rate: 500,
            active: true,
          }}
        >
          <Form.Item name="emp_code" label="Employee Code" rules={[{ required: true, message: 'Code required' }]}>
            <Input placeholder="e.g. EMP-101" />
          </Form.Item>
          <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Ramesh Kumar" />
          </Form.Item>
          <Form.Item name="phone" label="Phone (Optional)">
            <Input placeholder="e.g. 9876543210" />
          </Form.Item>
          <Form.Item name="stage_id" label="Primary Stage">
            <Select
              allowClear
              placeholder="Select assigned stage"
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="default_shift_id" label="Default Shift">
            <Select
              allowClear
              placeholder="Select shift"
              options={shifts.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="wage_type" label="Wage Basis" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'daily', label: 'Daily Rate (days worked)' },
                { value: 'hourly', label: 'Hourly Rate' },
                { value: 'piece', label: 'Piece Rate (pieces/rolls produced)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="rate" label="Standard Rate (₹)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="piece_rate" label="Piece Rate (₹ per unit, if applicable)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
