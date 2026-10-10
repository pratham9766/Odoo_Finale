import { useState } from 'react';
import { Table, Button, Select, Space, message, Card } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader, SectionCard, StatusBadge } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';

export default function PlanningPage() {
  const qc = useQueryClient();
  const { can } = usePermission();

  // 1. Orders awaiting planning
  const ordersQ = useQuery({
    queryKey: ['orders', 'unplanned'],
    queryFn: () =>
      api.get('/orders?status=confirmed,waiting_material,material_ready&limit=50').then((r) => r.data?.data || r.data || []),
  });

  // 2. Planned work orders waiting for machines
  const workOrdersQ = useQuery({
    queryKey: ['work-orders', 'planned'],
    queryFn: () =>
      api.get('/work-orders?status=planned&limit=50').then((r) => r.data?.data?.rows || r.data?.rows || r.data || []),
  });

  // 3. Machines master
  const machinesQ = useQuery({
    queryKey: ['machines'],
    queryFn: () => api.get('/machines?active=true').then((r) => r.data?.rows || r.data || []),
  });

  const orders = Array.isArray(ordersQ.data) ? ordersQ.data : [];
  const workOrders = Array.isArray(workOrdersQ.data) ? workOrdersQ.data : [];
  const machines = Array.isArray(machinesQ.data) ? machinesQ.data : [];

  const planOrderMut = useMutation({
    mutationFn: (orderId) => api.post(`/orders/${orderId}/plan`, {}),
    onSuccess: () => {
      message.success('Order planned — work orders created across production stages');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err) => message.error(err.message || 'Could not plan order'),
  });

  const assignMachineMut = useMutation({
    mutationFn: ({ id, machineId }) => api.put(`/work-orders/${id}`, { machine_id: machineId }),
    onSuccess: () => {
      message.success('Machine assigned to planned work order');
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not assign machine'),
  });

  return (
    <div>
      <PageHeader
        title="Production Planning"
        subtitle="Generate stage work orders from confirmed orders and schedule machines"
        actions={[
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            onClick={() => {
              ordersQ.refetch();
              workOrdersQ.refetch();
            }}
          >
            Refresh
          </Button>,
        ]}
      />

      <SectionCard title="1. Orders Ready to Plan" className="mb-6">
        <Table
          dataSource={orders}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: 'Order No',
              dataIndex: 'order_no',
              key: 'order_no',
              render: (v, r) => <Link to={`/app/orders/${r.id}`}>{v}</Link>,
            },
            { title: 'Buyer', dataIndex: 'buyer_name', key: 'buyer_name' },
            { title: 'Deadline', dataIndex: 'deadline', key: 'deadline' },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (v) => <StatusBadge status={v} />,
            },
            {
              title: 'Action',
              key: 'action',
              render: (_, r) => (
                <Button
                  type="primary"
                  size="small"
                  loading={planOrderMut.isPending}
                  onClick={() => planOrderMut.mutate(r.id)}
                  style={{ background: '#006B73' }}
                >
                  Plan Stages & WOs
                </Button>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="2. Planned Stage Work Orders (Assign Machines)">
        <Table
          dataSource={workOrders}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'WO No', dataIndex: 'wo_no', key: 'wo_no', render: (v) => <strong>{v}</strong> },
            {
              title: 'Order',
              dataIndex: 'order_no',
              key: 'order_no',
              render: (v, r) => (r.order_id ? <Link to={`/app/orders/${r.order_id}`}>{v}</Link> : v),
            },
            { title: 'Stage', dataIndex: 'stage', key: 'stage' },
            { title: 'Target Qty', dataIndex: 'target_qty', key: 'target_qty' },
            {
              title: 'Machine Assignment',
              key: 'machine',
              render: (_, r) => (
                <Select
                  placeholder="Select machine"
                  value={r.machine_id || undefined}
                  style={{ width: 200 }}
                  onChange={(mId) => assignMachineMut.mutate({ id: r.id, machineId: mId })}
                  options={machines
                    .filter((m) => !r.stage_id || m.stage_id === r.stage_id)
                    .map((m) => ({ value: m.id, label: `${m.code} (${m.name})` }))}
                />
              ),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
