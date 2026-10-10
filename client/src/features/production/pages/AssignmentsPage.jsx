import { useState } from 'react';
import { Table, DatePicker, Select, Button, Space, Card, Tag, message } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { PageHeader, SectionCard } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [date, setDate] = useState(dayjs());
  const [selectedShift, setSelectedShift] = useState(null);
  const [assignmentsMap, setAssignmentsMap] = useState({}); // machineId -> workerId

  const dateStr = date.format('YYYY-MM-DD');

  // Shifts dropdown: GET /shifts
  const shiftsQ = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data?.rows || r.data || []),
  });

  const shifts = Array.isArray(shiftsQ.data) ? shiftsQ.data : [];
  const currentShiftId = selectedShift || shifts[0]?.id;

  // Machines list: GET /machines
  const machinesQ = useQuery({
    queryKey: ['machines'],
    queryFn: () => api.get('/machines?active=true').then((r) => r.data?.rows || r.data || []),
  });

  // Workers list: GET /workers
  const workersQ = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.get('/workers?active=true').then((r) => r.data?.rows || r.data || []),
  });

  // Current assignments for date & shift: GET /assignments?date=&shift_id=
  const assignmentsQ = useQuery({
    queryKey: ['assignments', dateStr, currentShiftId],
    queryFn: () =>
      api.get(`/assignments?date=${dateStr}&shift_id=${currentShiftId}`).then((r) => {
        const rows = r.data?.rows || r.data || [];
        const map = {};
        for (const a of rows) {
          if (a.machine_id && a.worker_id) map[a.machine_id] = a.worker_id;
        }
        setAssignmentsMap(map);
        return rows;
      }),
    enabled: !!currentShiftId,
  });

  const machines = Array.isArray(machinesQ.data) ? machinesQ.data : [];
  const workers = Array.isArray(workersQ.data) ? workersQ.data : [];

  const saveMutation = useMutation({
    mutationFn: (entries) =>
      api.post('/assignments', {
        date: dateStr,
        shift_id: currentShiftId,
        entries,
      }),
    onSuccess: () => {
      message.success('Machine assignments saved');
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Failed to save assignments'),
  });

  const handleSave = () => {
    const entries = Object.entries(assignmentsMap)
      .filter(([_, workerId]) => Boolean(workerId))
      .map(([machineId, workerId]) => ({ machine_id: machineId, worker_id: workerId }));

    if (entries.length === 0) {
      message.warning('Please assign at least one worker to a machine');
      return;
    }
    saveMutation.mutate(entries);
  };

  const columns = [
    {
      title: 'Machine Code',
      dataIndex: 'code',
      key: 'code',
      render: (v) => <strong>{v}</strong>,
      width: 140,
    },
    {
      title: 'Stage',
      dataIndex: 'stage',
      key: 'stage',
      width: 150,
    },
    {
      title: 'Capacity',
      key: 'capacity',
      render: (_, r) => `${r.capacity_per_hour || '-'} ${r.capacity_uom || ''}/hr`,
      width: 160,
    },
    {
      title: 'Assigned Operator / Worker',
      key: 'worker',
      render: (_, r) => (
        <Select
          allowClear
          showSearch
          placeholder="Select worker for machine"
          style={{ width: '100%', maxWidth: 300 }}
          value={assignmentsMap[r.id] || undefined}
          onChange={(wId) => {
            setAssignmentsMap((prev) => ({ ...prev, [r.id]: wId }));
          }}
          disabled={!can(P.ASSIGNMENT_MANAGE)}
          filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={workers.map((w) => ({
            value: w.id,
            label: `${w.name} (${w.emp_code || w.role || 'Operator'})`,
          }))}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Worker ↔ Machine Assignments"
        subtitle="Assign shift workers to active machines"
        actions={[
          can(P.ASSIGNMENT_MANAGE) && (
            <Button
              key="save"
              type="primary"
              icon={<SaveOutlined />}
              loading={saveMutation.isPending}
              onClick={handleSave}
              style={{ background: '#006B73' }}
            >
              Save Grid
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => assignmentsQ.refetch()}>
            Refresh
          </Button>,
        ].filter(Boolean)}
      />

      <div className="flex flex-wrap gap-4 items-center mb-6 p-4 bg-white rounded-lg border border-[#DCE3E9]">
        <div>
          <span style={{ fontSize: 13, color: '#536278', display: 'block', marginBottom: 4 }}>Date</span>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} format="YYYY-MM-DD" />
        </div>

        <div>
          <span style={{ fontSize: 13, color: '#536278', display: 'block', marginBottom: 4 }}>Shift</span>
          <Select
            style={{ width: 180 }}
            value={currentShiftId}
            onChange={setSelectedShift}
            options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)})` }))}
          />
        </div>
      </div>

      <div className="tl-table-container">
        <Table
          dataSource={machines}
          columns={columns}
          rowKey="id"
          loading={machinesQ.isLoading || assignmentsQ.isLoading}
          size="middle"
          pagination={false}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>
    </div>
  );
}
