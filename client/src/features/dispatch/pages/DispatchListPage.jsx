import { useState } from 'react';
import { Table, Button, Input } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { PageHeader, StatusBadge } from '@/components/common';
import { fetchDispatches } from '../api';
import { formatDate } from '@/lib/format';

export default function DispatchListPage() {
  const { orgId } = useOrg();
  const { can } = usePermission();
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dispatch', orgId],
    queryFn: ({ signal }) => fetchDispatches({ orgId, signal }),
    enabled: !!orgId,
  });

  const dispatches = data?.data ?? [];

  const columns = [
    { title: 'Dispatch No.', dataIndex: 'dispatch_no', key: 'dispatch_no', render: (v, r) => <Link to={`/app/dispatch/${r.id}`} style={{ fontWeight: 600 }}>{v}</Link> },
    { title: 'Order', dataIndex: 'order_no', key: 'order_no' },
    { title: 'Buyer', dataIndex: 'buyer_name', key: 'buyer_name' },
    { title: 'Rolls', dataIndex: 'rolls_count', key: 'rolls_count', align: 'right' },
    { title: 'Length (m)', dataIndex: 'total_length_m', key: 'total_length_m', align: 'right' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <StatusBadge status={v} /> },
    { title: 'Date', dataIndex: 'confirmed_at', key: 'confirmed_at', render: v => v ? formatDate(v) : '—' }
  ];

  return (
    <div>
      <PageHeader
        title="Dispatches"
        subtitle="Manage shipments and deliveries"
        actions={[
          can(P.DISPATCH_CREATE) && (
            <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/dispatch/new')}>
              New Dispatch
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={refetch}>Refresh</Button>
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={dispatches}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 25 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>
    </div>
  );
}
