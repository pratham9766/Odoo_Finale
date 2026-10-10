import { useState } from 'react';
import {
  Form, Input, InputNumber, Select, Button,
  Typography, Row, Col, message, Space,
} from 'antd';
import { SaveOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, SectionCard } from '@/components/common';
import { createReceipt, postReceipt } from '../api';

const { Option } = Select;
const { Text } = Typography;

export default function NewReceiptPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Suppliers dropdown: GET /contacts?type=supplier
  const suppliersQ = useQuery({
    queryKey: ['contacts', 'supplier'],
    queryFn: () => api.get('/contacts?type=supplier').then((r) => r.data?.data || r.data || []),
  });

  // Raw yarn / items dropdown: GET /items
  const itemsQ = useQuery({
    queryKey: ['items'],
    queryFn: () => api.get('/items').then((r) => r.data?.data || r.data || []),
  });

  // Orders dropdown: for which order is this yarn? (Scene 1 in PDF)
  const ordersQ = useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => api.get('/orders?limit=50').then((r) => r.data?.data || r.data || []),
  });

  const suppliers = Array.isArray(suppliersQ.data) ? suppliersQ.data : [];
  const items = Array.isArray(itemsQ.data) ? itemsQ.data : [];
  const orders = Array.isArray(ordersQ.data) ? ordersQ.data : [];

  const handleSave = async (shouldPost) => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload = {
        supplier_contact_id: values.supplier_contact_id || undefined,
        vehicle_no: values.vehicle_no || undefined,
        notes: values.notes || undefined,
        lines: [
          {
            item_id: values.item_id,
            lot_no: values.lot_no,
            received_qty: Number(values.received_qty),
            expected_qty: values.expected_qty ? Number(values.expected_qty) : Number(values.received_qty),
            rate: Number(values.rate || 0),
            for_order_id: values.for_order_id || undefined,
            dye_batch: values.dye_batch || undefined,
          },
        ],
      };

      // 1. Create draft GRN
      const res = await createReceipt(payload);
      const receiptId = res?.data?.id || res?.id;

      // 2. If user clicked "Post GRN", immediately post to update inventory stock
      if (shouldPost && receiptId) {
        await postReceipt(receiptId);
        message.success('GRN posted successfully — stock updated');
      } else {
        message.success('GRN draft saved');
      }

      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['receipts'] });
      navigate('/app/inventory/receipts');
    } catch (err) {
      if (err?.errorFields) return; // Antd validation
      message.error(err.message || 'Failed to save goods receipt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Receive Goods (New GRN)"
        breadcrumbs={[
          { title: <Link to="/app/inventory/receipts">Goods Receipts</Link> },
          { title: 'New GRN' },
        ]}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ received_qty: 100, expected_qty: 100, lot_no: `LOT-${Date.now().toString().slice(-6)}` }}
      >
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <SectionCard title="Receipt Information">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="supplier_contact_id" label="Supplier">
                    <Select
                      showSearch
                      allowClear
                      placeholder="Select supplier"
                      loading={suppliersQ.isLoading}
                      filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="vehicle_no" label="Vehicle No.">
                    <Input placeholder="e.g. TN 38 AB 1234" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="for_order_id" label="For Which Order? (Optional)">
                    <Select
                      showSearch
                      allowClear
                      placeholder="Tag arriving yarn to an active order"
                      loading={ordersQ.isLoading}
                      filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={orders.map((o) => ({ value: o.id, label: `${o.order_no} — ${o.buyer_name || 'Buyer'} (${o.status})` }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="notes" label="Notes / Invoice Ref">
                    <Input placeholder="e.g. Challan #4489" />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>

            <SectionCard title="Material Line" className="mt-4">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="item_id"
                    label="Item (Yarn / Raw Material)"
                    rules={[{ required: true, message: 'Please select an item' }]}
                  >
                    <Select
                      showSearch
                      placeholder="Select material"
                      loading={itemsQ.isLoading}
                      filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={items.map((i) => ({ value: i.id, label: `${i.name} [${i.kind || ''}]` }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="lot_no"
                    label="Lot / Batch No."
                    rules={[{ required: true, message: 'Please enter lot number' }]}
                  >
                    <Input placeholder="e.g. LOT-2026-091" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="received_qty"
                    label="Received Quantity (kg)"
                    rules={[{ required: true, message: 'Please enter received quantity' }]}
                  >
                    <InputNumber min={0.1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="expected_qty" label="Expected Quantity (kg)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="rate" label="Unit Rate (₹)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>
          </Col>

          <Col xs={24} lg={8}>
            <SectionCard title="Actions">
              <p style={{ color: '#536278', marginBottom: 16 }}>
                Posting a GRN increments live stock on the shelf and can fulfill yarn reservations for active orders.
              </p>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  block
                  size="large"
                  loading={submitting}
                  onClick={() => handleSave(true)}
                  style={{ background: '#006B73' }}
                >
                  Post GRN (Update Stock)
                </Button>
                <Button
                  icon={<SaveOutlined />}
                  block
                  size="large"
                  loading={submitting}
                  onClick={() => handleSave(false)}
                >
                  Save as Draft
                </Button>
                <Button block onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              </Space>
            </SectionCard>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
