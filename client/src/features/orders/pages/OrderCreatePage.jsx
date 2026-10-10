import { useState } from 'react';
import { Form, Input, Button, DatePicker, Select, InputNumber, Row, Col, Space, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCreateOrder } from '../queries';
import { PageHeader, SectionCard } from '@/components/common';
import dayjs from 'dayjs';

const { Option } = Select;

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const createMutation = useCreateOrder();

  // Load buyers dropdown: GET /contacts?type=buyer
  const buyersQ = useQuery({
    queryKey: ['contacts', 'buyer'],
    queryFn: () => api.get('/contacts?type=buyer').then((r) => r.data?.data || r.data || []),
  });

  // Load finished fabric items dropdown: GET /items?kind=finished_fabric
  const itemsQ = useQuery({
    queryKey: ['items', 'finished_fabric'],
    queryFn: () => api.get('/items?kind=finished_fabric').then((r) => r.data?.data || r.data || []),
  });

  const buyers = Array.isArray(buyersQ.data) ? buyersQ.data : [];
  const items = Array.isArray(itemsQ.data) ? itemsQ.data : [];

  const handleFinish = (values) => {
    const payload = {
      buyer_contact_id: values.buyer_contact_id,
      buyer_ref: values.buyer_ref || undefined,
      deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : dayjs().add(7, 'day').format('YYYY-MM-DD'),
      priority: values.priority || 'normal',
      delivery_address: values.delivery_address || undefined,
      notes: values.notes || undefined,
      lines: [
        {
          item_id: values.item_id,
          colour: values.colour || undefined,
          qty: Number(values.qty),
          uom: values.uom || 'm',
          rate: Number(values.rate || 0),
        },
      ],
    };

    createMutation.mutate(payload, {
      onSuccess: (res) => {
        message.success('Order created successfully');
        const id = res?.data?.id || res?.id;
        navigate(`/app/orders/${id}`);
      },
      onError: (err) => {
        message.error(err.message || 'Failed to create order');
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Create Order"
        breadcrumbs={[
          { title: <Link to="/app/orders">Orders</Link> },
          { title: 'New Order' },
        ]}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          priority: 'normal',
          uom: 'm',
          qty: 1000,
          deadline: dayjs().add(14, 'day'),
        }}
      >
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <SectionCard title="Order Details">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="buyer_contact_id"
                    label="Buyer"
                    rules={[{ required: true, message: 'Please select a buyer' }]}
                  >
                    <Select
                      showSearch
                      placeholder="Select buyer contact"
                      loading={buyersQ.isLoading}
                      filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={buyers.map((b) => ({ value: b.id, label: `${b.name} ${b.city ? `(${b.city})` : ''}` }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="buyer_ref" label="Buyer Ref / PO #">
                    <Input placeholder="e.g. PO-8821" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="deadline"
                    label="Deadline"
                    rules={[{ required: true, message: 'Please select a deadline' }]}
                  >
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="priority" label="Priority">
                    <Select>
                      <Option value="low">Low</Option>
                      <Option value="normal">Normal</Option>
                      <Option value="high">High</Option>
                      <Option value="urgent">Urgent</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>

            <SectionCard title="Fabric Line" className="mt-4">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="item_id"
                    label="Finished Fabric Item"
                    rules={[{ required: true, message: 'Please select finished fabric item' }]}
                  >
                    <Select
                      showSearch
                      placeholder="Select fabric"
                      loading={itemsQ.isLoading}
                      filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={items.map((it) => ({ value: it.id, label: `${it.name} (${it.code || it.uom})` }))}
                      onChange={(id) => {
                        const sel = items.find((i) => i.id === id);
                        if (sel?.uom) form.setFieldsValue({ uom: sel.uom });
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="colour" label="Colour">
                    <Input placeholder="e.g. Navy Blue" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="qty"
                    label="Quantity"
                    rules={[{ required: true, message: 'Please enter quantity' }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="uom" label="Unit">
                    <Select>
                      <Option value="m">m</Option>
                      <Option value="kg">kg</Option>
                      <Option value="pcs">pcs</Option>
                      <Option value="roll">roll</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="rate" label="Rate (₹)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>
          </Col>

          <Col xs={24} lg={8}>
            <SectionCard title="Actions">
              <p style={{ color: '#536278', marginBottom: 16 }}>
                Once created, the order is in <strong>Draft</strong>. From the order page, you can confirm it to check material and reserve yarn.
              </p>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  block
                  size="large"
                  loading={createMutation.isPending}
                >
                  Create Order
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
