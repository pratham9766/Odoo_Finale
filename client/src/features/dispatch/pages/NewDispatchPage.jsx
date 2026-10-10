import { useState } from 'react';
import { Form, Input, Button, Select, Row, Col, Space, message } from 'antd';
import { ArrowLeftOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { PageHeader, SectionCard } from '@/components/common';
import { createDispatch } from '../api';
import { ORDERS } from '@/mocks/fixtures';

const { Option } = Select;

export default function NewDispatchPage() {
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [form] = Form.useForm();

  const createMutation = useMutation({
    mutationFn: (payload) => createDispatch({ orgId, payload }),
    onSuccess: (res) => {
      message.success('Dispatch created. Start scanning rolls.');
      navigate(`/app/dispatch/${res.data.id}`);
    },
    onError: (err) => {
      message.error(err.message || 'Failed to create dispatch');
    }
  });

  const handleFinish = (values) => {
    // Find buyer details from selected order for fixture mockup consistency
    const selectedOrder = ORDERS.find(o => o.order_no === values.order_no);
    const payload = {
      order_no: values.order_no,
      buyer_name: selectedOrder ? selectedOrder.buyer_name : 'Unknown Buyer',
      vehicle_no: values.vehicle_no,
    };
    createMutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title="New Dispatch"
        breadcrumbs={[
          { title: <Link to="/app/dispatch">Dispatches</Link> },
          { title: 'New Dispatch' },
        ]}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
      >
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <SectionCard title="Select Order">
              <Form.Item
                name="order_no"
                label="Order Number"
                rules={[{ required: true, message: 'Please select an order' }]}
              >
                <Select showSearch placeholder="Search order by number...">
                  {ORDERS.filter(o => o.status === 'ready_to_ship' || o.status === 'partially_dispatched').map(o => (
                    <Option key={o.order_no} value={o.order_no}>{o.order_no} ({o.buyer_name})</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="vehicle_no"
                label="Vehicle Number (Optional)"
              >
                <Input placeholder="e.g. MH01AB1234" />
              </Form.Item>
            </SectionCard>
          </Col>

          <Col xs={24} lg={8}>
            <SectionCard title="Actions">
              <p style={{ color: '#536278', marginBottom: 16 }}>
                Create a dispatch record first, then you will be able to scan rolls into the packing list.
              </p>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<RightOutlined />}
                  block
                  size="large"
                  loading={createMutation.isPending}
                >
                  Create & Scan Rolls
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
