import { useState } from 'react';
import { Table, Tag, Button, Space, Modal, DatePicker, message, Card } from 'antd';
import { PlusOutlined, ReloadOutlined, CheckCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, download } from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { formatINR } from '@/lib/format';

export default function WagesPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [prepareModal, setPrepareModal] = useState(false);
  const [month, setMonth] = useState(dayjs());
  const [detailRun, setDetailRun] = useState(null);

  // List wage runs: GET /wages/runs
  const runsQ = useQuery({
    queryKey: ['wages', 'runs'],
    queryFn: () => api.get('/wages/runs').then((r) => r.data?.rows || r.data || []),
  });

  const runs = Array.isArray(runsQ.data) ? runsQ.data : [];

  const prepareMut = useMutation({
    mutationFn: (mStr) => api.post('/wages/runs', { month: mStr }),
    onSuccess: () => {
      message.success('Wage run prepared from attendance & output registers');
      setPrepareModal(false);
      qc.invalidateQueries({ queryKey: ['wages', 'runs'] });
    },
    onError: (err) => message.error(err.message || 'Failed to prepare wage run'),
  });

  const approveMut = useMutation({
    mutationFn: (id) => api.post(`/wages/runs/${id}/approve`, {}),
    onSuccess: () => {
      message.success('Wage run approved');
      qc.invalidateQueries({ queryKey: ['wages', 'runs'] });
    },
    onError: (err) => message.error(err.message || 'Failed to approve wages'),
  });

  const payMut = useMutation({
    mutationFn: (id) => api.post(`/wages/runs/${id}/pay`, {}),
    onSuccess: () => {
      message.success('Wages marked paid — expenses recorded in accounting');
      qc.invalidateQueries({ queryKey: ['wages', 'runs'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => message.error(err.message || 'Failed to pay wages'),
  });

  const openDetail = async (runId) => {
    try {
      const res = await api.get(`/wages/runs/${runId}`);
      setDetailRun(res.data);
    } catch (err) {
      message.error(err.message || 'Could not load run lines');
    }
  };

  const columns = [
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      render: (v, r) => (
        <a onClick={() => openDetail(r.id)} style={{ fontWeight: 600 }}>
          {dayjs(v).format('MMMM YYYY')}
        </a>
      ),
      width: 150,
    },
    {
      title: 'Workers',
      dataIndex: 'workers',
      key: 'workers',
      align: 'right',
      width: 100,
    },
    {
      title: 'Total Gross',
      dataIndex: 'total_gross',
      key: 'total_gross',
      render: (v) => formatINR(v),
      align: 'right',
      width: 130,
    },
    {
      title: 'Total Net',
      dataIndex: 'total_net',
      key: 'total_net',
      render: (v) => formatINR(v),
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
      title: 'Actions',
      key: 'actions',
      render: (_, r) => (
        <Space size="small">
          <Button size="small" onClick={() => openDetail(r.id)}>
            Lines
          </Button>
          {r.status === 'draft' && can(P.WAGES_PAY) && (
            <Button
              size="small"
              type="primary"
              loading={approveMut.isPending}
              onClick={() => approveMut.mutate(r.id)}
            >
              Approve
            </Button>
          )}
          {r.status === 'approved' && can(P.WAGES_PAY) && (
            <Button
              size="small"
              type="primary"
              icon={<DollarOutlined />}
              style={{ background: '#18794E' }}
              loading={payMut.isPending}
              onClick={() => payMut.mutate(r.id)}
            >
              Pay
            </Button>
          )}
        </Space>
      ),
      width: 180,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Wages & Payroll"
        subtitle="Monthly wages calculated from attendance (days) and piece-rate production"
        actions={[
          can(P.WAGES_RUN) && (
            <Button
              key="prep"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setPrepareModal(true)}
              style={{ background: '#006B73' }}
            >
              Prepare Wage Run
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => runsQ.refetch()}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="tl-table-container">
        <Table
          dataSource={runs}
          columns={columns}
          rowKey="id"
          loading={runsQ.isLoading}
          size="middle"
          pagination={{ pageSize: 12 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      {/* Prepare Modal */}
      <Modal
        title="Prepare Wage Run"
        open={prepareModal}
        onCancel={() => setPrepareModal(false)}
        onOk={() => prepareMut.mutate(month.format('YYYY-MM'))}
        confirmLoading={prepareMut.isPending}
        okText="Calculate & Prepare"
      >
        <p style={{ color: '#536278' }}>
          Select the payroll month. The system will sum attendance records (days worked) and production output logs:
        </p>
        <DatePicker
          picker="month"
          value={month}
          onChange={(m) => m && setMonth(m)}
          style={{ width: '100%' }}
        />
      </Modal>

      {/* Detail / Lines Modal */}
      <Modal
        title={`Wage Breakdown — ${detailRun?.month ? dayjs(detailRun.month).format('MMMM YYYY') : ''}`}
        open={!!detailRun}
        onCancel={() => setDetailRun(null)}
        width={760}
        footer={[
          <Button key="close" onClick={() => setDetailRun(null)}>
            Close
          </Button>,
        ]}
      >
        <Table
          dataSource={detailRun?.lines || []}
          rowKey="worker_id"
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Worker', dataIndex: 'worker_name', key: 'name', render: (v, r) => <strong>{v || r.worker_id}</strong> },
            { title: 'Days', dataIndex: 'days', key: 'days', align: 'right' },
            { title: 'Pieces', dataIndex: 'pieces', key: 'pieces', align: 'right' },
            { title: 'Gross Pay', dataIndex: 'gross', key: 'gross', render: (v) => formatINR(v), align: 'right' },
            { title: 'Net Pay', dataIndex: 'net', key: 'net', render: (v) => <strong>{formatINR(v)}</strong>, align: 'right' },
          ]}
        />
      </Modal>
    </div>
  );
}
