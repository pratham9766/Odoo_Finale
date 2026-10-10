import { useState } from 'react';
import { Form, Input, Button, DatePicker, Select, InputNumber, Row, Col, Space, Divider, message } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateOrder } from '../queries';
import { PageHeader, SectionCard } from '@/components/common';
import dayjs from 'dayjs';

const { Option } = Select;

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const createMutation = useCreateOrder();

  const handleFinish = (values) => {
    // Format payload
    const payload = {
      buyer_name: values.buyer_name,
      deadline: values.deadline ? values.deadline.toISOString() : null,
      priority: values.priority,
      lines: [
        {
          item_name: values.item_name,
          colour: values.colour,
          qty: values.qty,
          uom: values.uom,
          rate: values.rate,
        }
      ]
    };
    
    createMutation.mutate(payload, {
      onSuccess: (res) => {
        message.success('Order created successfully');
        navigate(`/app/orders/${res.data.id}`);
      },
      onError: (err) => {
        message.error(err.message || 'Failed to create order');
      }
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
        initialValues={{ priority: 'normal', uom: 'm', qty: 1000 }}
      >
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <SectionCard title="Order Details">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="buyer_name"
                    label="Buyer Name"
                    rules={[{ required: true, message: 'Please enter buyer name' }]}
                  >
                    <Input placeholder="Enter buyer name" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="deadline"
                    label="Deadline"
                    rules={[{ required: true, message: 'Please select a deadline' }]}
                  >
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="priority"
                    label="Priority"
                  >
                    <Select>
                      <Option value="normal">Normal</Option>
                      <Option value="high">High</Option>
                      <Option value="urgent">Urgent</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>

            <SectionCard title="Item Line" className="mt-4">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="item_name"
                    label="Item Name"
                    rules={[{ required: true, message: 'Please enter item name' }]}
                  >
                    <Input placeholder="e.g. Cotton Fabric 40s" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="colour"
                    label="Colour"
                  >
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
                  <Form.Item
                    name="uom"
                    label="Unit"
                  >
                    <Select>
                      <Option value="m">m</Option>
                      <Option value="kg">kg</Option>
                      <Option value="pcs">pcs</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="rate"
                    label="Rate (₹)"
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>
          </Col>

          <Col xs={24} lg={8}>
            <SectionCard title="Actions">
              <p style={{ color: '#536278', marginBottom: 16 }}>
                Once created, the order will be in <strong>Draft</strong> state. You can then confirm it to reserve materials.
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
