import { useState } from 'react';
import { Table, Tag, Button, Select, Space, Progress, Modal, InputNumber, Input, message } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, SectionCard, StatusBadge } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import {
  fetchWorkOrders, startWorkOrder, pauseWorkOrder, resumeWorkOrder,
  logProduction, finishWorkOrder, assignMachineToWorkOrder, fetchMachines,
} from '../api';

export default function WorkOrdersPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [logModal, setLogModal] = useState(null);
  const [logQty, setLogQty] = useState(10);
  const [wasteQty, setWasteQty] = useState(0);

  const [pauseModal, setPauseModal] = useState(null);
  const [pauseReason, setPauseReason] = useState('Shift handover / meal break');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['work-orders', statusFilter],
    queryFn: ({ signal }) => fetchWorkOrders({ status: statusFilter, signal }),
    staleTime: 15_000,
  });

  const machinesQ = useQuery({
    queryKey: ['machines'],
    queryFn: ({ signal }) => fetchMachines({ active: true, signal }),
  });

  const workOrders = data?.data?.rows || data?.rows || data?.data || (Array.isArray(data) ? data : []);
  const machines = machinesQ.data?.data?.rows || machinesQ.data?.rows || machinesQ.data || [];

  const startMut = useMutation({
    mutationFn: (id) => startWorkOrder(id),
    onSuccess: () => {
      message.success('Work order started');
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not start work order'),
  });

  const pauseMut = useMutation({
    mutationFn: ({ id, reason }) => pauseWorkOrder({ id, reason }),
    onSuccess: () => {
      message.info('Work order paused');
      setPauseModal(null);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not pause work order'),
  });

  const resumeMut = useMutation({
    mutationFn: (id) => resumeWorkOrder(id),
    onSuccess: () => {
      message.success('Work order resumed');
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not resume work order'),
  });

  const logMut = useMutation({
    mutationFn: ({ id, qty, uom, waste_qty }) => logProduction({ id, qty, uom, waste_qty }),
    onSuccess: () => {
      message.success('Production logged');
      setLogModal(null);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not log production'),
  });

  const finishMut = useMutation({
    mutationFn: ({ id, final_qty, uom }) => finishWorkOrder({ id, final_qty, uom }),
    onSuccess: () => {
      message.success('Work order marked finished');
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not finish work order'),
  });

  const assignMut = useMutation({
    mutationFn: ({ id, machineId }) => assignMachineToWorkOrder({ id, machineId }),
    onSuccess: () => {
      message.success('Machine assigned to work order');
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err) => message.error(err.message || 'Could not assign machine'),
  });

  const columns = [
    {
      title: 'WO No.',
      dataIndex: 'wo_no',
      key: 'wo_no',
      render: (v) => <strong>{v}</strong>,
      width: 140,
    },
    {
      title: 'Order No.',
      dataIndex: 'order_no',
      key: 'order_no',
      render: (v, r) => (r.order_id ? <Link to={`/app/orders/${r.order_id}`}>{v}</Link> : v),
      width: 130,
    },
    {
      title: 'Stage',
      dataIndex: 'stage',
      key: 'stage',
      width: 120,
    },
    {
      title: 'Output Item',
      dataIndex: 'item',
      key: 'item',
      ellipsis: true,
    },
    {
      title: 'Machine',
      key: 'machine',
      render: (_, r) => {
        if (r.status === 'planned' && can(P.PRODUCTION_PLAN)) {
          return (
            <Select
              placeholder="Assign machine"
              value={r.machine_id || undefined}
              style={{ width: 150 }}
              onChange={(mId) => assignMut.mutate({ id: r.id, machineId: mId })}
              options={machines
                .filter((m) => !r.stage_id || m.stage_id === r.stage_id)
                .map((m) => ({ value: m.id, label: `${m.code} (${m.name})` }))}
            />
          );
        }
        return <span>{r.machine_code || 'Unassigned'}</span>;
      },
      width: 170,
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_, r) => (
        <div>
          <span style={{ fontSize: 12 }}>
            {r.produced_qty || 0} / {r.target_qty} {r.capacity_uom || ''}
          </span>
          <Progress percent={Math.round(r.pct || 0)} size="small" />
        </div>
      ),
      width: 150,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <StatusBadge status={v} />,
      width: 110,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) => {
        if (!can(P.PRODUCTION_LOG)) return null;
        return (
          <Space size="small">
            {r.status === 'planned' && (
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                loading={startMut.isPending}
                onClick={() => startMut.mutate(r.id)}
              >
                Start
              </Button>
            )}
            {r.status === 'paused' && (
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                loading={resumeMut.isPending}
                onClick={() => resumeMut.mutate(r.id)}
              >
                Resume
              </Button>
            )}
            {r.status === 'running' && (
              <>
                <Button
                  size="small"
                  onClick={() => {
                    setLogModal(r);
                    setLogQty(10);
                    setWasteQty(0);
                  }}
                >
                  Log Output
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<PauseCircleOutlined />}
                  onClick={() => setPauseModal(r)}
                >
                  Pause
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  style={{ background: '#18794E' }}
                  onClick={() => finishMut.mutate({ id: r.id, final_qty: r.produced_qty, uom: r.capacity_uom })}
                >
                  Finish
                </Button>
              </>
            )}
          </Space>
        );
      },
      width: 220,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle="Floor execution and progress tracking"
        actions={[
          <Select
            key="status"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'planned', label: 'Planned' },
              { value: 'running', label: 'Running' },
              { value: 'paused', label: 'Paused' },
              { value: 'finished', label: 'Finished' },
            ]}
          />,
          <Button key="refresh" icon={<ReloadOutlined />} onClick={refetch}>
            Refresh
          </Button>,
        ]}
      />

      <div className="tl-table-container">
        <Table
          dataSource={workOrders}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 20 }}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>

      {/* Log Output Modal */}
      <Modal
        title={`Log Production — ${logModal?.wo_no}`}
        open={!!logModal}
        onCancel={() => setLogModal(null)}
        onOk={() =>
          logMut.mutate({
            id: logModal?.id,
            qty: Number(logQty),
            uom: logModal?.capacity_uom || 'm',
            waste_qty: Number(wasteQty || 0),
          })
        }
        confirmLoading={logMut.isPending}
        okText="Record Output"
      >
        <p style={{ color: '#536278' }}>
          Record metres or kg produced in this batch:
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Good Output ({logModal?.capacity_uom || 'm'})
          </label>
          <InputNumber
            min={0.1}
            value={logQty}
            onChange={setLogQty}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Wastage / Scrap ({logModal?.capacity_uom || 'm'})
          </label>
          <InputNumber
            min={0}
            value={wasteQty}
            onChange={setWasteQty}
            style={{ width: '100%' }}
          />
        </div>
      </Modal>

      {/* Pause Modal */}
      <Modal
        title={`Pause Work Order — ${pauseModal?.wo_no}`}
        open={!!pauseModal}
        onCancel={() => setPauseModal(null)}
        onOk={() => pauseMut.mutate({ id: pauseModal?.id, reason: pauseReason })}
        confirmLoading={pauseMut.isPending}
        okText="Pause Work Order"
      >
        <p style={{ color: '#536278' }}>Reason for pausing work order:</p>
        <Input
          value={pauseReason}
          onChange={(e) => setPauseReason(e.target.value)}
          placeholder="e.g. Lunch break, shift handover, yarn replenishment"
        />
      </Modal>
    </div>
  );
}
