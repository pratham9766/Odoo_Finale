import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { fetchMachineBoard } from '../api';
import { Row, Col, Tag, Typography, Button, Drawer, Badge, Progress, Tooltip, Select } from 'antd';
import { ThunderboltOutlined, ClockCircleOutlined, ToolOutlined, UserOutlined, ReloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { PageHeader } from '@/components/common';
import { timeAgo, formatTime } from '@/lib/format';
import { STAGES } from '@/mocks/fixtures';

const { Text } = Typography;

const STATUS_LABELS = {
  running:     { label: 'Running',     css: 'tl-badge-running' },
  idle:        { label: 'Idle',        css: 'tl-badge-idle' },
  breakdown:   { label: 'Breakdown',   css: 'tl-badge-breakdown' },
  maintenance: { label: 'Maintenance', css: 'tl-badge-pending' },
};

function MachineCard({ machine, onClick }) {
  const s = STATUS_LABELS[machine.status] ?? STATUS_LABELS.idle;
  return (
    <div
      className={`tl-machine-card ${machine.status}`}
      onClick={() => onClick(machine)}
      onKeyDown={e => e.key === 'Enter' && onClick(machine)}
      role="button"
      tabIndex={0}
      aria-label={`${machine.name} — ${s.label}`}
    >
      {/* Status bar top */}
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontWeight: 700, fontSize: 15, color: '#12233F' }}>{machine.code}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.css}`}>{s.label}</span>
      </div>

      <div style={{ fontSize: 13, color: '#536278', marginBottom: 8 }}>{machine.name}</div>

      {/* Work order */}
      {machine.current_work_order_id ? (
        <div style={{ background: '#F4F6F8', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#536278', marginBottom: 2 }}>Work order</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#12233F' }}>{machine.current_work_order_id}</div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#536278', marginBottom: 8, fontStyle: 'italic' }}>No active work order</div>
      )}

      {/* Output today */}
      <div className="flex justify-between items-center mb-2">
        <Text style={{ fontSize: 12, color: '#536278' }}>Today's output</Text>
        <Text style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {machine.produced_today?.toLocaleString('en-IN')} {machine.capacity_uom}
        </Text>
      </div>

      {/* Progress bar */}
      {machine.capacity_per_hour > 0 && (
        <Tooltip title={`Target based on capacity: ${machine.capacity_per_hour} ${machine.capacity_uom}/hr`}>
          <Progress
            percent={Math.min(100, Math.round((machine.produced_today / (machine.capacity_per_hour * 8)) * 100))}
            size="small"
            strokeColor={machine.status === 'running' ? '#006B73' : '#F08C00'}
            showInfo={false}
          />
        </Tooltip>
      )}

      {/* Operator */}
      {machine.operator && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#536278', display: 'flex', alignItems: 'center', gap: 4 }}>
          <UserOutlined />
          <span>{machine.operator}</span>
        </div>
      )}

      {/* Breakdown warning */}
      {machine.status === 'breakdown' && machine.breakdown_since && (
        <div style={{ marginTop: 8, padding: '6px 8px', background: '#FEE2E2', borderRadius: 4, fontSize: 12 }}>
          <span style={{ color: '#B42318', fontWeight: 600 }}>Breakdown</span>
          <span style={{ color: '#536278', marginLeft: 6 }}>since {formatTime(machine.breakdown_since)}</span>
          {machine.breakdown_reason && (
            <div style={{ color: '#536278', marginTop: 2 }}>{machine.breakdown_reason}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MachineBoardPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [selectedStage, setSelectedStage] = useState(null);
  const [drawerMachine, setDrawerMachine] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['production', 'board', orgId, selectedStage],
    queryFn: ({ signal }) => fetchMachineBoard({ orgId, stageId: selectedStage, signal }),
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Realtime
  useSocketEvent('machine.status_changed', () => qc.invalidateQueries({ queryKey: ['production', 'board', orgId] }));
  useSocketEvent('production.logged', () => qc.invalidateQueries({ queryKey: ['production', 'board', orgId] }));

  const stages = data?.data ?? [];

  // Summary counts
  const allMachines = stages.flatMap(s => s.machines ?? []);
  const counts = {
    running: allMachines.filter(m => m.status === 'running').length,
    idle: allMachines.filter(m => m.status === 'idle').length,
    breakdown: allMachines.filter(m => m.status === 'breakdown').length,
    maintenance: allMachines.filter(m => m.status === 'maintenance').length,
  };

  return (
    <div>
      <PageHeader
        title="Machine board"
        subtitle="Live status by stage — click any machine for logs"
        actions={[
          <Select
            key="stage"
            allowClear
            placeholder="All stages"
            value={selectedStage}
            onChange={setSelectedStage}
            style={{ width: 140 }}
            options={STAGES.map(s => ({ value: s.id, label: s.name }))}
          />,
          <Button key="refresh" icon={<ReloadOutlined />} onClick={refetch}>Refresh</Button>,
        ]}
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Running',     count: counts.running,     color: '#18794E', bg: '#DCFCE7' },
          { label: 'Idle',        count: counts.idle,        color: '#925400', bg: '#FEF3C7' },
          { label: 'Breakdown',   count: counts.breakdown,   color: '#B42318', bg: '#FEE2E2' },
          { label: 'Maintenance', count: counts.maintenance, color: '#536278', bg: '#F4F6F8' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}30`, borderRadius: 20, padding: '4px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{c.count}</span>
            <span style={{ fontSize: 13, color: c.color }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Stage groups */}
      {isLoading ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 180, background: '#fff', border: '1px solid #DCE3E9', borderRadius: 8 }} className="animate-pulse" />
          ))}
        </div>
      ) : stages.map(stage => (
        <div key={stage.id} className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#12233F' }}>{stage.name}</h3>
            <Tag>{stage.machines?.length} machines</Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {stage.machines?.map(m => (
              <MachineCard key={m.id} machine={m} onClick={setDrawerMachine} />
            ))}
          </div>
        </div>
      ))}

      {/* Machine detail drawer */}
      <Drawer
        title={drawerMachine ? `${drawerMachine.code} — ${drawerMachine.name}` : ''}
        open={!!drawerMachine}
        onClose={() => setDrawerMachine(null)}
        width={420}
        placement="left"
        styles={{ body: { padding: 24 } }}
      >
        {drawerMachine && (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div style={{ fontSize: 12, color: '#536278' }}>Stage</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {STAGES.find(s => s.id === drawerMachine.stage_id)?.name}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#536278' }}>Capacity</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {drawerMachine.capacity_per_hour} {drawerMachine.capacity_uom}/hr
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#536278' }}>Today's output</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {drawerMachine.produced_today?.toLocaleString('en-IN')} {drawerMachine.capacity_uom}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#536278' }}>Operator</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{drawerMachine.operator ?? '—'}</div>
              </div>
            </div>

            {drawerMachine.status === 'breakdown' && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: '#B42318', marginBottom: 4 }}>Breakdown reported</div>
                <div style={{ fontSize: 13, color: '#536278' }}>Since: {formatTime(drawerMachine.breakdown_since)}</div>
                <div style={{ fontSize: 13, color: '#536278' }}>Reason: {drawerMachine.breakdown_reason}</div>
              </div>
            )}

            <div style={{ background: '#F4F6F8', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#536278' }}>
                Log history and full event timeline will appear here when backend is connected.
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
