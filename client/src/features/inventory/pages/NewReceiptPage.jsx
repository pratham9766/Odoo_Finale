import { useState } from 'react';
import {
  Form, Input, InputNumber, Select, Button, Divider, Alert,
  Card, Typography, Row, Col, Steps, message, Space,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { PageHeader, SectionCard } from '@/components/common';
import { postReceipt, saveDraftReceipt } from '../api';

const { Title, Text } = Typography;

const ITEMS = [
  { value: 'si-001', label: 'Cotton Yarn 40s — Natural' },
  { value: 'si-002', label: 'Cotton Yarn 30s — Red' },
  { value: 'si-003', label: 'Cotton Yarn 30s — White' },
  { value: 'si-004', label: 'Reactive Dye — Red' },
  { value: 'si-005', label: 'Reactive Dye — Navy' },
  { value: 'si-007', label: 'Cotton Fibre — Natural' },
];

const UOM_OPTIONS = ['kg', 'm', 'pcs', 'litre', 'box'];

export default function NewReceiptPage() {
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const [isDraft, setIsDraft] = useState(false);

  const postMutation = useMutation({
    mutationFn: (payload) => postReceipt({ orgId, payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', 'stock', orgId] });
      qc.invalidateQueries({ queryKey: ['inventory', 'receipts', orgId] });
      message.success('Receipt posted — stock updated');
      navigate('/app/inventory/receipts');
    },
    onError: (err) => {
      message.error(err.message ?? 'Failed to post receipt');
      err._handled = true;
    },
    retry: false,
  });

  const draftMutation = useMutation({
    mutationFn: (payload) => saveDraftReceipt({ orgId, payload }),
    onSuccess: () => {
      message.success('Draft saved — stock NOT updated until posted');
      navigate('/app/inventory/receipts');
    },
    retry: false,
  });

  const handlePost = async () => {
    try {
      const values = await form.validateFields();
      if (values.received_qty > values.expected_qty * 1.05) {
        message.warning('Received quantity exceeds expected by more than 5% — verify before posting');
      }
      postMutation.mutate(values);
    } catch { /* form validation error, already shown */ }
  };

  const handleDraft = async () => {
    const values = form.getFieldsValue();
    setIsDraft(true);
    draftMutation.mutate(values);
  };

  const expectedQty = Form.useWatch('expected_qty', form);
  const receivedQty = Form.useWatch('received_qty', form);
  const shortage = expectedQty && receivedQty ? expectedQty - receivedQty : 0;

  return (
    <div>
      <PageHeader
        title="New goods receipt"
        breadcrumbs={[
          { title: 'Inventory' },
          { title: <a onClick={() => navigate('/app/inventory/receipts')}>Receipts</a> },
          { title: 'New GRN' },
        ]}
      />

      <Alert
        className="mb-6"
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Draft vs Posted"
        description="Saving as draft does NOT update stock quantities. Posting is a permanent action — a posted receipt cannot be casually edited. Verify quantities carefully before posting."
      />

      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        initialValues={{ uom: 'kg' }}
      >
        <Row gutter={[24, 0]}>
          <Col xs={24} lg={16}>
            <SectionCard title="Supplier & reference">
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="supplier_name"
                    label="Supplier"
                    rules={[{ required: true, message: 'Select a supplier' }]}
                  >
                    <Select
                      showSearch
                      placeholder="Select supplier…"
                      options={[
                        { value: 'org-supplier-004', label: 'Rajasthan Yarn Co.' },
                        { value: 'manual', label: 'Manual / offline supplier' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="vehicle_no" label="Vehicle number">
                    <Input placeholder="e.g. RJ14CD5678" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="linked_po" label="Linked purchase order">
                    <Select allowClear placeholder="Select PO (optional)" options={[]} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="dc_no" label="Supplier DC / invoice no.">
                    <Input placeholder="DC-2026-XXXX" />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>

            <SectionCard title="Item details" className="mt-4">
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="item_id"
                    label="Item"
                    rules={[{ required: true, message: 'Select an item' }]}
                  >
                    <Select showSearch placeholder="Select item…" options={ITEMS} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="lot_no" label="Lot / batch number">
                    <Input placeholder="LOT-2026-XXX" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="expected_qty"
                    label="Expected quantity"
                    rules={[{ required: true, type: 'number', min: 0.001, message: 'Enter expected qty' }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} inputMode="decimal" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="received_qty"
                    label="Received quantity"
                    rules={[{ required: true, type: 'number', min: 0.001, message: 'Enter received qty' }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} inputMode="decimal" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="uom" label="Unit" rules={[{ required: true }]}>
                    <Select options={UOM_OPTIONS.map(u => ({ value: u, label: u }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="rate" label="Rate per unit (₹)">
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={v => v.replace(/₹\s?|(,*)/g, '')}
                      inputMode="decimal"
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* Short receipt indicator */}
              {shortage > 0.001 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`Short receipt: ${shortage.toLocaleString('en-IN')} units short`}
                  description="Only the received quantity will be credited to stock. The shortage must be resolved by an additional receipt or PO amendment."
                  style={{ marginTop: 12 }}
                />
              )}
            </SectionCard>

            <SectionCard title="Remarks" className="mt-4">
              <Form.Item name="remarks" label="Remarks / condition notes">
                <Input.TextArea rows={3} placeholder="Optional: damage, shortage reason, quality notes…" />
              </Form.Item>
            </SectionCard>
          </Col>

          {/* Summary rail */}
          <Col xs={24} lg={8}>
            <SectionCard title="Receipt summary">
              <div className="space-y-3">
                {[
                  { label: 'Expected', value: expectedQty ? `${expectedQty.toLocaleString('en-IN')}` : '—' },
                  { label: 'Received', value: receivedQty ? `${receivedQty.toLocaleString('en-IN')}` : '—' },
                  { label: 'Shortage', value: shortage > 0 ? shortage.toLocaleString('en-IN') : '—', warn: shortage > 0 },
                ].map(row => (
                  <div key={row.label} className="flex justify-between">
                    <Text type="secondary">{row.label}</Text>
                    <Text style={{ fontWeight: 600, color: row.warn ? '#B42318' : '#12233F', fontVariantNumeric: 'tabular-nums' }}>
                      {row.value}
                    </Text>
                  </div>
                ))}
              </div>

              <Divider />

              <div style={{ fontSize: 13, color: '#536278', marginBottom: 16 }}>
                <InfoCircleOutlined style={{ marginRight: 6 }} />
                Stock is only updated when you <strong>Post</strong> the receipt. Draft saves the form without changing stock.
              </div>

              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<CheckOutlined />}
                  onClick={handlePost}
                  loading={postMutation.isPending}
                  disabled={draftMutation.isPending}
                >
                  Post receipt (updates stock)
                </Button>
                <Button
                  block
                  icon={<SaveOutlined />}
                  onClick={handleDraft}
                  loading={draftMutation.isPending}
                  disabled={postMutation.isPending}
                >
                  Save as draft
                </Button>
                <Button block onClick={() => navigate(-1)}>Cancel</Button>
              </Space>
            </SectionCard>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
