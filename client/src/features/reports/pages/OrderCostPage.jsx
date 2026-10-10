import { useState } from 'react';
import { Table, DatePicker, Button, Space, Tag } from 'antd';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, download } from '@/lib/api';
import { PageHeader, SectionCard, StatusBadge } from '@/components/common';
import { formatINR, formatDate } from '@/lib/format';

const { RangePicker } = DatePicker;

export default function OrderCostPage() {
  const [range, setRange] = useState([dayjs().subtract(30, 'day'), dayjs()]);

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', 'order-cost', from, to],
    queryFn: () => api.get(`/reports/order-cost?from=${from}&to=${to}`).then((r) => r.data || {}),
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  const columns = [
    { title: 'Order No.', dataIndex: 'order_no', key: 'order_no', render: (v) => <strong>{v}</strong>, width: 140 },
    { title: 'Buyer', dataIndex: 'buyer', key: 'buyer' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <StatusBadge status={v} />, width: 120 },
    { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', render: (v) => formatINR(v), align: 'right' },
    { title: 'Material Cost', dataIndex: 'material_cost', key: 'mat', render: (v) => formatINR(v), align: 'right' },
    { title: 'Labour Cost', dataIndex: 'labour_cost', key: 'lab', render: (v) => formatINR(v), align: 'right' },
    { title: 'Machine Cost', dataIndex: 'machine_cost', key: 'mac', render: (v) => formatINR(v), align: 'right' },
    { title: 'Total Cost', dataIndex: 'total_cost', key: 'tot', render: (v) => formatINR(v), align: 'right' },
    {
      title: 'Profit',
      dataIndex: 'profit',
      key: 'profit',
      render: (v) => <strong style={{ color: v >= 0 ? '#18794E' : '#B42318' }}>{formatINR(v)}</strong>,
      align: 'right',
    },
    {
      title: 'Margin %',
      dataIndex: 'margin_pct',
      key: 'margin',
      render: (v) => `${v}%`,
      align: 'right',
      width: 100,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cost Per Order & Profitability"
        subtitle="Full job-order costing: Material + Labour + Machine overhead vs Revenue"
        actions={[
          <Button
            key="csv"
            icon={<DownloadOutlined />}
            onClick={() => download(`/reports/order-cost/export.csv?from=${from}&to=${to}`, `order-cost-${from}-${to}.csv`)}
          >
            Export CSV
          </Button>,
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => refetch()}>
            Refresh
          </Button>,
        ]}
      />

      <div className="flex flex-wrap gap-4 items-center mb-6 p-4 bg-white rounded-lg border border-[#DCE3E9]">
        <div>
          <span style={{ fontSize: 13, color: '#536278', display: 'block', marginBottom: 4 }}>Date Range</span>
          <RangePicker value={range} onChange={(r) => r && setRange(r)} />
        </div>
        {totals.revenue !== undefined && (
          <div className="ml-auto flex gap-4">
            <div>
              <span style={{ fontSize: 12, color: '#536278' }}>Total Revenue:</span>{' '}
              <strong>{formatINR(totals.revenue)}</strong>
            </div>
            <div>
              <span style={{ fontSize: 12, color: '#536278' }}>Total Profit:</span>{' '}
              <strong style={{ color: totals.profit >= 0 ? '#18794E' : '#B42318' }}>{formatINR(totals.profit)}</strong>
            </div>
            <div>
              <span style={{ fontSize: 12, color: '#536278' }}>Average Margin:</span>{' '}
              <strong>{totals.margin_pct}%</strong>
            </div>
          </div>
        )}
      </div>

      <div className="tl-table-container">
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="order_no"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>
    </div>
  );
}
