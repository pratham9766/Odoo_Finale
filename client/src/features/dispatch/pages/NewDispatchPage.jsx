import { useState } from 'react';
import { Form, Input, Button, Select, Row, Col, Space, message } from 'antd';
import { ArrowLeftOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, SectionCard } from '@/components/common';
import { createDispatch } from '../api';

const { Option } = Select;

export default function NewDispatchPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // Load orders that are ready to ship or partially dispatched
  const ordersQ = useQuery({
    queryKey: ['orders', 'ready_for_dispatch'],
    queryFn: () =>
      api.get('/orders?status=ready_to_ship,partially_dispatched,in_production&limit=50').then((r) => r.data?.data || r.data || []),
  });

  const orders = Array.isArray(ordersQ.data) ? ordersQ.data : [];

  const createMutation = useMutation({
    mutationFn: (payload) => createDispatch(payload),
    onSuccess: (res) => {
      message.success('Dispatch created. Start scanning rolls onto the truck.');
      const id = res?.data?.id || res?.id;
      navigate(`/app/dispatch/${id}`);
    },
    onError: (err) => {
      message.error(err.message || 'Failed to create dispatch');
    },
  });

  const handleFinish = (values) => {
    const payload = {
      order_id: values.order_id,
      vehicle_no: values.vehicle_no ? values.vehicle_no.trim().toUpperCase() : undefined,
      driver_name: values.driver_name || undefined,
      driver_phone: values.driver_phone || undefined,
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

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <SectionCard title="Select Order">
              <Form.Item
                name="order_id"
                label="Order"
                rules={[{ required: true, message: 'Please select an order' }]}
              >
                <Select
                  showSearch
                  placeholder="Select order to dispatch"
                  loading={ordersQ.isLoading}
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={orders.map((o) => ({
                    value: o.id,
                    label: `${o.order_no} — ${o.buyer_name || 'Buyer'} [Status: ${o.status}]`,
                  }))}
                />
              </Form.Item>
            </SectionCard>

            <SectionCard title="Vehicle & Driver (Truck Loading)" className="mt-4">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="vehicle_no" label="Vehicle Number">
                    <Input placeholder="e.g. TN 38 XY 5678" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="driver_name" label="Driver Name">
                    <Input placeholder="e.g. Ramesh Singh" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="driver_phone" label="Driver Phone">
                    <Input placeholder="e.g. 9876543210" />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>
          </Col>

          <Col xs={24} lg={8}>
            <SectionCard title="Process">
              <p style={{ color: '#536278', marginBottom: 16 }}>
                Creating a dispatch opens a <strong>Packing</strong> session. Only QC-passed rolls for this order can be scanned.
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
                  Start Scanning Rolls
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
