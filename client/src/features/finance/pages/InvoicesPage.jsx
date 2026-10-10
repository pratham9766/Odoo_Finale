import { useState } from 'react';
import { Table, Button, Space, Tag } from 'antd';
import { FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, download } from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/common';
import { formatINR, formatDate } from '@/lib/format';

export default function InvoicesPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/invoices').then((r) => r.data?.rows || r.data || []),
  });

  const invoices = Array.isArray(data) ? data : [];

  const columns = [
    {
      title: 'Invoice No.',
      dataIndex: 'invoice_no',
      key: 'invoice_no',
      render: (v) => <strong>{v}</strong>,
      width: 150,
    },
    {
      title: 'Buyer',
      dataIndex: 'buyer_name',
      key: 'buyer_name',
      render: (v, r) => v || r.to_party || 'Buyer',
    },
    {
      title: 'Order No.',
      dataIndex: 'order_no',
      key: 'order_no',
      render: (v, r) => (r.order_id ? <Link to={`/app/orders/${r.order_id}`}>{v}</Link> : v || '-'),
      width: 140,
    },
    {
      title: 'Total Amount',
      dataIndex: 'total',
      key: 'total',
      render: (v) => formatINR(v),
      align: 'right',
      width: 130,
    },
    {
      title: 'Paid Amount',
      dataIndex: 'paid_amount',
      key: 'paid_amount',
      render: (v) => formatINR(v || 0),
      align: 'right',
      width: 130,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <StatusBadge status={v} />,
      width: 120,
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (v) => (v ? formatDate(v) : '-'),
      width: 120,
    },
    {
      title: 'Action',
      key: 'pdf',
      render: (_, r) => (
        <Button
          size="small"
          icon={<FilePdfOutlined />}
          onClick={() => download(`/invoices/${r.id}/pdf`, `${r.invoice_no}.pdf`)}
        >
          PDF
        </Button>
      ),
      width: 90,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        subtitle="Invoices generated automatically upon truck dispatch"
        actions={[
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => refetch()}>
            Refresh
          </Button>,
        ]}
      />

      <div className="tl-table-container">
        <Table
          dataSource={invoices}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>
    </div>
  );
}
