import { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, Switch, DatePicker, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { formatINR, formatDate } from '@/lib/format';

export default function BillsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // List expenses & supplier bills: GET /expenses
  const expensesQ = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get('/expenses').then((r) => r.data?.rows || r.data || []),
  });

  const expenses = Array.isArray(expensesQ.data) ? expensesQ.data : [];

  const recordMutation = useMutation({
    mutationFn: (values) =>
      api.post('/expenses', {
        category: values.category,
        amount: Number(values.amount),
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        note: values.note || undefined,
        paid: values.paid !== false,
      }),
    onSuccess: () => {
      message.success('Bill / expense recorded');
      setModalOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => message.error(err.message || 'Failed to record bill'),
  });

  const columns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (v) => <Tag color={v === 'supplier_bill' ? 'blue' : 'purple'}>{v?.replace('_', ' ').toUpperCase()}</Tag>,
      width: 160,
    },
    { title: 'Description / Note', dataIndex: 'note', key: 'note' },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (v) => formatINR(v),
      align: 'right',
      width: 140,
    },
    {
      title: 'Status',
      dataIndex: 'paid',
      key: 'paid',
      render: (v) => (v ? <Tag color="success">PAID</Tag> : <Tag color="warning">UNPAID (OWED)</Tag>),
      width: 130,
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (v) => formatDate(v),
      width: 120,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Supplier Bills & Expenses"
        subtitle="Manage operating costs, supplier payables and power bills"
        actions={[
          can(P.EXPENSE_MANAGE) && (
            <Button
              key="add"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ background: '#006B73' }}
            >
              Record Bill / Expense
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => expensesQ.refetch()}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={expenses}
          columns={columns}
          rowKey="id"
          loading={expensesQ.isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      <Modal
        title="Record Bill or Operational Expense"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then((v) => recordMutation.mutate(v))}
        confirmLoading={recordMutation.isPending}
        okText="Save Entry"
      >
        <Form form={form} layout="vertical" initialValues={{ category: 'supplier_bill', date: dayjs(), paid: true }}>
          <Form.Item name="category" label="Expense Category" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'supplier_bill', label: 'Supplier Bill (Yarn / Raw Goods)' },
                { value: 'power', label: 'Power & Electricity' },
                { value: 'maintenance', label: 'Machine Maintenance / Parts' },
                { value: 'rent', label: 'Rent & Facility' },
                { value: 'salary_staff', label: 'Staff Salaries (Admin/Office)' },
                { value: 'other', label: 'Other Operational Cost' },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true, message: 'Amount required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Bill # / Note">
            <Input placeholder="e.g. Inv #8812 - Lakshmi Yarn Mills" />
          </Form.Item>
          <Form.Item name="date" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paid" label="Already Paid?" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
