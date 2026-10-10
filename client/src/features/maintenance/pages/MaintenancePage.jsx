import { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Input, message } from 'antd';
import { ToolOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';

export default function MaintenancePage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [resolveModal, setResolveModal] = useState(null);
  const [resolution, setResolution] = useState('Replaced worn needle / cleared jam');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['maintenance', 'tickets'],
    queryFn: () => api.get('/maintenance/tickets').then((r) => r.data?.rows || r.data || []),
    staleTime: 15_000,
  });

  const tickets = Array.isArray(data) ? data : [];

  const startMut = useMutation({
    mutationFn: (id) => api.post(`/maintenance/tickets/${id}/start`, {}),
    onSuccess: () => {
      message.success('Maintenance work started');
      qc.invalidateQueries({ queryKey: ['maintenance', 'tickets'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Failed to start maintenance'),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, resolution }) => api.post(`/maintenance/tickets/${id}/resolve`, { resolution }),
    onSuccess: () => {
      message.success('Ticket resolved — machine returned to service');
      setResolveModal(null);
      qc.invalidateQueries({ queryKey: ['maintenance', 'tickets'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Failed to resolve ticket'),
  });

  const columns = [
    { title: 'Ticket No', dataIndex: 'ticket_no', key: 'ticket_no', render: (v) => <strong>{v}</strong>, width: 140 },
    { title: 'Machine', dataIndex: 'machine_code', key: 'machine_code', width: 120 },
    { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 130 },
    { title: 'Symptom / Reason', dataIndex: 'reason', key: 'reason' },
    {
      title: 'Downtime',
      dataIndex: 'downtime_minutes',
      key: 'downtime',
      render: (v) => `${v || 0} mins`,
      width: 110,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => (
        <Tag color={v === 'open' ? 'error' : v === 'in_progress' ? 'warning' : 'success'}>
          {v?.toUpperCase()}
        </Tag>
      ),
      width: 120,
    },
    {
      title: 'Opened At',
      dataIndex: 'opened_at',
      key: 'opened_at',
      render: (v) => formatDateTime(v),
      width: 160,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => {
        if (!can(P.MAINTENANCE_FIX, P.BREAKDOWN_REPORT)) return null;
        if (r.status === 'open') {
          return (
            <Button
              size="small"
              type="primary"
              icon={<ToolOutlined />}
              loading={startMut.isPending}
              onClick={() => startMut.mutate(r.id)}
            >
              Start Fix
            </Button>
          );
        }
        if (r.status === 'in_progress') {
          return (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              style={{ background: '#18794E' }}
              onClick={() => setResolveModal(r)}
            >
              Resolve
            </Button>
          );
        }
        return <span style={{ color: '#536278', fontSize: 13 }}>Resolved</span>;
      },
      width: 120,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Maintenance Tickets"
        subtitle="Machine breakdowns and repair workflows"
        actions={[
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => refetch()}>
            Refresh
          </Button>,
        ]}
      />

      <div className="tl-table-container">
        <Table
          dataSource={tickets}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      <Modal
        title={`Resolve Maintenance — ${resolveModal?.machine_code}`}
        open={!!resolveModal}
        onCancel={() => setResolveModal(null)}
        onOk={() => resolveMut.mutate({ id: resolveModal?.id, resolution })}
        confirmLoading={resolveMut.isPending}
        okText="Resolve & Restore Machine"
      >
        <p style={{ color: '#536278' }}>Enter resolution details for this repair:</p>
        <Input.TextArea
          rows={3}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="e.g. Replaced bearing, cleared lint buildup, restored sensor"
        />
      </Modal>
    </div>
  );
}
