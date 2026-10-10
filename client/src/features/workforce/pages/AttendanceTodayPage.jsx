import { useState, useEffect } from 'react';
import { Table, Tag, Button, Select, DatePicker, Radio, Space, message, Card } from 'antd';
import { SaveOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { PageHeader, SectionCard } from '@/components/common';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';

export default function AttendanceTodayPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [date, setDate] = useState(dayjs());
  const [selectedShift, setSelectedShift] = useState(null);
  const [statusMap, setStatusMap] = useState({}); // workerId -> status

  const dateStr = date.format('YYYY-MM-DD');

  // Shifts: GET /shifts
  const shiftsQ = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data?.rows || r.data || []),
  });

  const shifts = Array.isArray(shiftsQ.data) ? shiftsQ.data : [];
  const currentShiftId = selectedShift || shifts[0]?.id;

  // Workers: GET /workers
  const workersQ = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.get('/workers?active=true').then((r) => r.data?.rows || r.data || []),
  });

  // Today's attendance summary & existing rows: GET /attendance?date=&shift_id=
  const attendanceQ = useQuery({
    queryKey: ['attendance', dateStr, currentShiftId],
    queryFn: () =>
      api.get(`/attendance?date=${dateStr}&shift_id=${currentShiftId}`).then((r) => {
        const rows = r.data?.rows || r.data || [];
        const map = {};
        for (const row of rows) {
          if (row.worker_id && row.status) map[row.worker_id] = row.status;
        }
        return { rows, map };
      }),
    enabled: !!currentShiftId,
  });

  const workers = Array.isArray(workersQ.data) ? workersQ.data : [];

  // Initialize statusMap from existing attendance or default to 'present'
  useEffect(() => {
    if (attendanceQ.data?.map) {
      const existing = attendanceQ.data.map;
      const initial = {};
      for (const w of workers) {
        initial[w.id] = existing[w.id] || 'present';
      }
      setStatusMap(initial);
    } else if (workers.length > 0) {
      const initial = {};
      for (const w of workers) {
        initial[w.id] = 'present';
      }
      setStatusMap(initial);
    }
  }, [attendanceQ.data, workers]);

  const bulkMutation = useMutation({
    mutationFn: (entries) =>
      api.post('/attendance/bulk', {
        date: dateStr,
        shift_id: currentShiftId,
        entries,
      }),
    onSuccess: () => {
      message.success('Attendance register saved');
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => message.error(err.message || 'Failed to save attendance'),
  });

  const handleSave = () => {
    const entries = Object.entries(statusMap).map(([workerId, status]) => ({
      worker_id: workerId,
      status,
    }));

    if (entries.length === 0) {
      message.warning('No workers found to mark attendance');
      return;
    }
    bulkMutation.mutate(entries);
  };

  const markAll = (status) => {
    const updated = {};
    for (const w of workers) updated[w.id] = status;
    setStatusMap(updated);
  };

  const presentCount = Object.values(statusMap).filter((s) => s === 'present' || s === 'late').length;
  const absentCount = Object.values(statusMap).filter((s) => s === 'absent').length;
  const halfDayCount = Object.values(statusMap).filter((s) => s === 'half_day').length;

  const columns = [
    { title: 'Emp Code', dataIndex: 'emp_code', key: 'emp_code', render: (v) => <strong>{v}</strong>, width: 120 },
    { title: 'Worker Name', dataIndex: 'name', key: 'name', width: 180 },
    { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 140 },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => (
        <Radio.Group
          value={statusMap[r.id] || 'present'}
          onChange={(e) => setStatusMap((prev) => ({ ...prev, [r.id]: e.target.value }))}
          disabled={!can(P.ATTENDANCE_MARK)}
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="present" style={{ color: '#18794E' }}>Present</Radio.Button>
          <Radio.Button value="half_day" style={{ color: '#925400' }}>Half Day</Radio.Button>
          <Radio.Button value="absent" style={{ color: '#B42318' }}>Absent</Radio.Button>
          <Radio.Button value="leave">Leave</Radio.Button>
        </Radio.Group>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Attendance Register"
        subtitle="Mark shift attendance (Present / Absent / Half Day / Leave)"
        actions={[
          can(P.ATTENDANCE_MARK) && (
            <Button
              key="save"
              type="primary"
              icon={<SaveOutlined />}
              loading={bulkMutation.isPending}
              onClick={handleSave}
              style={{ background: '#006B73' }}
            >
              Save Attendance
            </Button>
          ),
          <Button key="refresh" icon={<ReloadOutlined />} onClick={() => attendanceQ.refetch()}>
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

        {can(P.ATTENDANCE_MARK) && (
          <div className="ml-auto flex gap-2">
            <Button size="small" onClick={() => markAll('present')}>All Present</Button>
            <Button size="small" onClick={() => markAll('absent')}>All Absent</Button>
          </div>
        )}
      </div>

      {/* Summary KPI Strip */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Tag color="success" style={{ padding: '4px 12px', fontSize: 13 }}>Present: {presentCount}</Tag>
        <Tag color="error" style={{ padding: '4px 12px', fontSize: 13 }}>Absent: {absentCount}</Tag>
        <Tag color="warning" style={{ padding: '4px 12px', fontSize: 13 }}>Half Day: {halfDayCount}</Tag>
        <Tag style={{ padding: '4px 12px', fontSize: 13 }}>Total Workers: {workers.length}</Tag>
      </div>

      <div className="tl-table-container">
        <Table
          dataSource={workers}
          columns={columns}
          rowKey="id"
          loading={workersQ.isLoading || attendanceQ.isLoading}
          size="middle"
          pagination={false}
          style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
        />
      </div>
    </div>
  );
}
