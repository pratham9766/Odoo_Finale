import { useState } from 'react';
import { Table, Button, Modal, Form, Select, InputNumber, Input, DatePicker, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { formatINR, formatDateTime, formatDate } from '@/lib/format';

export default function PaymentsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Payments list: GET /payments
  const paymentsQ = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then((r) => r.data?.rows || r.data || []),
  });

  // Unpaid/partial invoices dropdown: GET /invoices?status=unpaid,partial
  const invoicesQ = useQuery({
    queryKey: ['invoices', 'due'],
    queryFn: () => api.get('/invoices?status=unpaid').then((r) => r.data?.rows || r.data || []),
  });

  const payments = Array.isArray(paymentsQ.data) ? paymentsQ.data : [];
  const invoices = Array.isArray(invoicesQ.data) ? invoicesQ.data : [];

  const recordMutation = useMutation({
    mutationFn: (values) =>
      api.post('/payments', {
        invoice_id: values.invoice_id,
        amount: Number(values.amount),
        mode: values.mode,
        ref_no: values.ref_no || undefined,
        paid_at: values.paid_at ? values.paid_at.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('Payment recorded successfully');
      setModalOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => message.error(err.message || 'Failed to record payment'),
  });

  const columns = [
    { title: 'Receipt / Ref', dataIndex: 'ref_no', key: 'ref_no', render: (v) => <strong>{v || 'PAY'}</strong>, width: 140 },
    { title: 'Invoice No.', dataIndex: 'invoice_no', key: 'invoice_no', width: 140 },
    { title: 'Buyer', dataIndex: 'buyer_name', key: 'buyer_name' },
    { title: 'Mode', dataIndex: 'mode', key: 'mode', render: (v) => v?.toUpperCase(), width: 110 },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (v) => formatINR(v),
      align: 'right',
      width: 130,
    },
    {
      title: 'Date',
      dataIndex: 'paid_at',
      key: 'paid_at',
      render: (v) => formatDate(v),
      width: 120,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Buyer Payments"
        subtitle="Record receipts against sales invoices"
        actions={[
          can(P.PAYMENT_RECORD) && (
            <Button
              key="rec"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ background: '#006B73' }}
            >
              Record Payment
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => paymentsQ.refetch()}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={payments}
          columns={columns}
          rowKey="id"
          loading={paymentsQ.isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      <Modal
        title="Record Payment from Buyer"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then((v) => recordMutation.mutate(v))}
        confirmLoading={recordMutation.isPending}
        okText="Record Payment"
      >
        <Form form={form} layout="vertical" initialValues={{ mode: 'bank', paid_at: dayjs() }}>
          <Form.Item
            name="invoice_id"
            label="Invoice"
            rules={[{ required: true, message: 'Please select an invoice' }]}
          >
            <Select
              showSearch
              placeholder="Select invoice to pay"
              options={invoices.map((inv) => ({
                value: inv.id,
                label: `${inv.invoice_no} — ${inv.buyer_name || 'Buyer'} (Balance: ₹${inv.total - (inv.paid_amount || 0)})`,
              }))}
              onChange={(invId) => {
                const inv = invoices.find((i) => i.id === invId);
                if (inv) form.setFieldsValue({ amount: inv.total - (inv.paid_amount || 0) });
              }}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount (₹)"
            rules={[{ required: true, message: 'Amount required' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="mode" label="Payment Mode" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'bank', label: 'Bank Transfer (NEFT/RTGS)' },
                { value: 'upi', label: 'UPI' },
                { value: 'cheque', label: 'Cheque' },
                { value: 'cash', label: 'Cash' },
              ]}
            />
          </Form.Item>
          <Form.Item name="ref_no" label="Reference / UTR No.">
            <Input placeholder="e.g. UTR88921102" />
          </Form.Item>
          <Form.Item name="paid_at" label="Payment Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
