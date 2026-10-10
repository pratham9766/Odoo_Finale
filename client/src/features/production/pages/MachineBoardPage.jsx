import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Row, Col, Tag, Typography, Button, Drawer, Progress, Tooltip, Select, Modal, Input, message } from 'antd';
import { ThunderboltOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { PageHeader, SectionCard, StatusBadge } from '@/components/common';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { fetchMachineBoard, reportMachineBreakdown } from '../api';
import { timeAgo, formatTime } from '@/lib/format';

const { Text } = Typography;

const STATUS_LABELS = {
  running:     { label: 'Running',     css: 'tl-badge-running', color: '#18794E' },
  idle:        { label: 'Idle',        css: 'tl-badge-idle', color: '#925400' },
  breakdown:   { label: 'Breakdown',   css: 'tl-badge-breakdown', color: '#B42318' },
  maintenance: { label: 'Maintenance', css: 'tl-badge-pending', color: '#536278' },
};

function MachineCard({ machine, onClick }) {
  const s = STATUS_LABELS[machine.status] ?? STATUS_LABELS.idle;
  return (
    <div
      className={`tl-machine-card ${machine.status}`}
      onClick={() => onClick(machine)}
      style={{
        background: '#fff',
        border: `1px solid ${machine.status === 'breakdown' ? '#B42318' : machine.status === 'running' ? '#18794E' : '#DCE3E9'}`,
        borderRadius: 8,
        padding: 16,
        cursor: 'pointer',
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontWeight: 700, fontSize: 16, color: '#12233F' }}>{machine.code}</span>
        <Tag color={machine.status === 'running' ? 'success' : machine.status === 'breakdown' ? 'error' : machine.status === 'idle' ? 'warning' : 'default'}>
          {s.label}
        </Tag>
      </div>

      <div style={{ fontSize: 13, color: '#536278', marginBottom: 8 }}>
        Stage: <strong>{machine.stage}</strong>
      </div>

      {machine.wo_no ? (
        <div style={{ background: '#F4F6F8', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#536278' }}>Work Order: <strong>{machine.wo_no}</strong></div>
          <div style={{ fontSize: 12, color: '#12233F' }}>Order: {machine.order_no || '-'}</div>
          {machine.pct !== null && (
            <Progress percent={Math.round(machine.pct || 0)} size="small" style={{ marginTop: 4 }} />
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#8C9BAE', marginBottom: 8, fontStyle: 'italic' }}>
          No active work order
        </div>
      )}

      <div className="flex justify-between items-center mb-1">
        <Text style={{ fontSize: 12, color: '#536278' }}>Output today</Text>
        <Text style={{ fontSize: 13, fontWeight: 600 }}>
          {Number(machine.today_qty || 0).toLocaleString('en-IN')} {machine.uom}
        </Text>
      </div>

      <div className="flex justify-between items-center">
        <Text style={{ fontSize: 12, color: '#536278' }}>Operator</Text>
        <Text style={{ fontSize: 12, fontWeight: 500, color: machine.operator ? '#006B73' : '#8C9BAE' }}>
          {machine.operator || 'Not assigned'}
        </Text>
      </div>
    </div>
  );
}

export default function MachineBoardPage() {
  const qc = useQueryClient();
  const [selectedStage, setSelectedStage] = useState(null);
  const [drawerMachine, setDrawerMachine] = useState(null);
  const [breakdownModal, setBreakdownModal] = useState(false);
  const [breakdownReason, setBreakdownReason] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['production', 'board', selectedStage],
    queryFn: ({ signal }) => fetchMachineBoard({ stageId: selectedStage, signal }),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  // Realtime updates
  useSocketEvent('machine.status_changed', () => qc.invalidateQueries({ queryKey: ['production', 'board'] }));
  useSocketEvent('machine.updated', () => qc.invalidateQueries({ queryKey: ['production', 'board'] }));
  useSocketEvent('production.logged', () => qc.invalidateQueries({ queryKey: ['production', 'board'] }));

  const breakdownMutation = useMutation({
    mutationFn: ({ machineId, reason }) => reportMachineBreakdown({ machineId, reason }),
    onSuccess: () => {
      message.success('Breakdown logged — maintenance notified');
      setBreakdownModal(false);
      setBreakdownReason('');
      setDrawerMachine(null);
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => {
      message.error(err.message || 'Failed to report breakdown');
    },
  });

  const boardData = data?.data || data || {};
  const machines = Array.isArray(boardData.machines) ? boardData.machines : [];
  const kpis = boardData.kpis || {
    total: machines.length,
    running: machines.filter((m) => m.status === 'running').length,
    idle: machines.filter((m) => m.status === 'idle').length,
    breakdown: machines.filter((m) => m.status === 'breakdown').length,
  };

  // Group machines by stage
  const stagesMap = new Map();
  for (const m of machines) {
    const sName = m.stage || 'General';
    if (!stagesMap.has(sName)) stagesMap.set(sName, []);
    stagesMap.get(sName).push(m);
  }

  return (
    <div>
      <PageHeader
        title="Machine Board"
        subtitle="Live production floor view by stage"
        actions={[
          <Button key="refresh" icon={<ReloadOutlined />} onClick={refetch}>Refresh</Button>,
        ]}
      />

      {/* KPI strip */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Running', count: kpis.running || 0, color: '#18794E', bg: '#DCFCE7' },
          { label: 'Idle', count: kpis.idle || 0, color: '#925400', bg: '#FEF3C7' },
          { label: 'Breakdown', count: kpis.breakdown || 0, color: '#B42318', bg: '#FEE2E2' },
          { label: 'Total Machines', count: kpis.total || machines.length, color: '#536278', bg: '#F4F6F8' },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: c.bg,
              border: `1px solid ${c.color}30`,
              borderRadius: 20,
              padding: '6px 16px',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: c.color }}>{c.count}</span>
            <span style={{ fontSize: 13, color: c.color }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Stages & Machines */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 160, background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }} />
          ))}
        </div>
      ) : (
        Array.from(stagesMap.entries()).map(([stageName, stageMachines]) => (
          <div key={stageName} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#12233F' }}>{stageName}</h3>
              <Tag>{stageMachines.length} machines</Tag>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {stageMachines.map((m) => (
                <MachineCard key={m.machine_id} machine={m} onClick={setDrawerMachine} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Machine Details / Breakdown Drawer */}
      <Drawer
        title={drawerMachine ? `${drawerMachine.code} (${drawerMachine.stage})` : ''}
        open={!!drawerMachine}
        onClose={() => setDrawerMachine(null)}
        width={380}
      >
        {drawerMachine && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#536278' }}>Current Status</div>
              <Tag
                color={
                  drawerMachine.status === 'running'
                    ? 'success'
                    : drawerMachine.status === 'breakdown'
                    ? 'error'
                    : 'warning'
                }
                style={{ fontSize: 14, padding: '2px 10px', marginTop: 4 }}
              >
                {drawerMachine.status.toUpperCase()}
              </Tag>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#536278' }}>Work Order</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{drawerMachine.wo_no || 'None'}</div>
              {drawerMachine.order_no && <div style={{ fontSize: 13 }}>Order: {drawerMachine.order_no}</div>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#536278' }}>Assigned Operator</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{drawerMachine.operator || 'None'}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#536278' }}>Output Today</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#006B73' }}>
                {drawerMachine.today_qty || 0} {drawerMachine.uom}
              </div>
            </div>

            {drawerMachine.status !== 'breakdown' ? (
              <Button
                danger
                block
                icon={<ThunderboltOutlined />}
                onClick={() => setBreakdownModal(true)}
              >
                Report Breakdown
              </Button>
            ) : (
              <div style={{ background: '#FEE2E2', padding: 12, borderRadius: 6, color: '#B42318' }}>
                Machine is under breakdown. Maintenance team has been notified.
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Breakdown Report Modal */}
      <Modal
        title={`Report Breakdown — ${drawerMachine?.code}`}
        open={breakdownModal}
        onCancel={() => setBreakdownModal(false)}
        onOk={() =>
          breakdownMutation.mutate({
            machineId: drawerMachine?.machine_id,
            reason: breakdownReason,
          })
        }
        confirmLoading={breakdownMutation.isPending}
        okText="Report Breakdown"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: '#536278' }}>Please specify the breakdown symptom or problem:</p>
        <Input.TextArea
          rows={3}
          placeholder="e.g. Motor overheated, needle jam, yarn guide broken"
          value={breakdownReason}
          onChange={(e) => setBreakdownReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
