import { useState } from 'react';
import { Table, Button } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { PageHeader, StatusBadge } from '@/components/common';
import { fetchReceipts } from '../api';
import { formatDate } from '@/lib/format';

export default function ReceiptsPage() {
  const { can } = usePermission();
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receipts'],
    queryFn: ({ signal }) => fetchReceipts({ signal }),
  });

  const receipts = data?.data ?? [];

  const columns = [
    {
      title: 'GRN No.',
      dataIndex: 'grn_no',
      key: 'grn_no',
      render: (v, r) => <span style={{ fontWeight: 600 }}>{v || r.id}</span>,
    },
    {
      title: 'Supplier',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      render: (v) => v || 'Direct Supply',
    },
    {
      title: 'Lines',
      dataIndex: 'line_count',
      key: 'line_count',
      align: 'right',
    },
    {
      title: 'Vehicle',
      dataIndex: 'vehicle_no',
      key: 'vehicle_no',
      render: (v) => v || '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <StatusBadge status={v} />,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v) => formatDate(v),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Goods Receipts (GRN)"
        subtitle="Incoming yarn and material receipts"
        actions={[
          can(P.RECEIPT_CREATE) && (
            <Button
              key="new"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/inventory/receipts/new')}
            >
              New GRN
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={refetch}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={receipts}
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
