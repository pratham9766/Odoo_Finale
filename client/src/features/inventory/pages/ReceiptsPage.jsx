import { useState } from 'react';
import { Table, Tag, Button, Input } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { PageHeader, StatusBadge } from '@/components/common';
import { fetchReceipts } from '../api';
import { formatDate } from '@/lib/format';

export default function ReceiptsPage() {
  const { orgId } = useOrg();
  const { can } = usePermission();
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', 'receipts', orgId],
    queryFn: ({ signal }) => fetchReceipts({ orgId, signal }),
    enabled: !!orgId,
  });

  const receipts = data?.data ?? [];

  const columns = [
    { title: 'Receipt No.', dataIndex: 'id', key: 'id', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Item', dataIndex: 'item_name', key: 'item_name' },
    { title: 'Qty', dataIndex: 'received_qty', key: 'received_qty', align: 'right' },
    { title: 'Supplier', dataIndex: 'supplier_name', key: 'supplier_name' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <StatusBadge status={v} /> },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', render: v => formatDate(v) }
  ];

  return (
    <div>
      <PageHeader
        title="Goods Receipts"
        subtitle="Manage incoming materials"
        actions={[
          can(P.RECEIPT_CREATE) && (
            <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/inventory/receipts/new')}>
              New GRN
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={refetch}>Refresh</Button>
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
