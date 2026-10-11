import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Empty, Progress, Select, Table, Tabs, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { PageTitle, QueryState, Status } from '@/components/States';
import { date, money, quantity } from '@/lib/format';

const WAGE_LABEL = { daily: 'per day', hourly: 'per hour', piece: 'per unit produced' };
const ATTENDANCE_COLOR = { present: 'green', late: 'gold', half_day: 'orange', absent: 'red', leave: 'blue', weekly_off: 'default', holiday: 'default' };
const time = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '–');
const label = (v) => (v || '').replaceAll('_', ' ');
const initials = (name) => (name || '?').split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// permission areas (permissions.domain) → their screen and a readable name
const AREAS = {
  orders: ['Orders', '/app/orders'], contacts: ['Buyers & suppliers', '/app/contacts'], catalog: ['Items & recipes', '/app/items'],
  inventory: ['Inventory', '/app/stock'], procurement: ['Purchasing', null], production: ['Production', '/app/production'],
  maintenance: ['Maintenance', '/app/maintenance'], quality: ['Quality control', '/app/quality'], dispatch: ['Dispatch', '/app/dispatch'],
  finance: ['Accounts', '/app/finance'], workforce: ['Workforce', '/app/attendance'], reports: ['Reports', '/app/reports'],
  staff: ['Staff & roles', '/app/staff'], settings: ['Mill settings', '/app/settings'],
};

/** The last 12 months as YYYY-MM, newest first. */
function lastMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  });
}

/** An employee's own page: who they are, today's machine, and the month's attendance, output and pay. */
export default function MyWork() {
  const session = useSession();
  const months = lastMonths();
  const [month, setMonth] = useState(months[0].value);
  const work = useQuery({
    queryKey: [session.userId, 'my-work', month],
    queryFn: ({ signal }) => session.api(`/me/work?month=${month}`, { signal }),
    refetchInterval: 60000,
  });
  const d = work.data?.data;
  const name = session.context.user?.full_name || 'My work';

  const monthPicker = <Select value={month} onChange={setMonth} options={months} style={{ minWidth: 180 }} aria-label="Month" />;

  return (
    <div className="my-work">
      <PageTitle eyebrow="EMPLOYEE" title={name} description={<>{session.context.mill.name} · <Tag color="blue">{session.context.role.name}</Tag></>} action={d?.linked && monthPicker} />
      <QueryState query={work}>
        {d && (
          <>
            {d.linked ? <Linked d={d} session={session} /> : (
              <>
                <StaffCard profile={d.profile} />
                <Alert className="my-note" type="info" showIcon
                  message="Attendance, machine output and payslips appear here for staff who are on the mill's worker list."
                  description="If you are paid through the mill's wage run, ask the owner to link your login under Staff → Edit → Linked worker." />
              </>
            )}
            <AccessPanel access={d.access} />
          </>
        )}
      </QueryState>
    </div>
  );
}

/** For staff who are not on the worker list: who they are, from their profile. */
function StaffCard({ profile }) {
  return (
    <section className="panel my-id">
      <div className="my-id-avatar">{initials(profile.full_name)}</div>
      <dl className="my-id-facts">
        <div><dt>Role</dt><dd>{profile.role}</dd></div>
        <div><dt>Email</dt><dd className="my-break">{profile.email}</dd></div>
        <div><dt>Phone</dt><dd>{profile.phone || '–'}</dd></div>
        <div><dt>City</dt><dd>{profile.city || '–'}</dd></div>
        <div><dt>Member since</dt><dd>{date(profile.joined_at)}</dd></div>
        <div><dt>Account</dt><dd><Link to="/app/profile">Edit profile & password</Link></dd></div>
      </dl>
    </section>
  );
}

/** What the person's role allows, one card per area, with a link to that screen. */
function AccessPanel({ access }) {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>What you can do</h2><span>From your role. The owner can change it in Roles & permissions.</span></div>
      {access.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Your role gives access to My work and your profile only." />
        : (
          <div className="my-access">
            {access.map((a) => {
              const [name, to] = AREAS[a.domain] || [label(a.domain), null];
              return (
                <div className="my-access-card" key={a.domain}>
                  <div className="my-access-head"><strong>{name}</strong>{to && <Link to={to}>Open →</Link>}</div>
                  <ul>{a.items.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}

function Linked({ d, session }) {
  const { worker, today, summary } = d;
  const outputText = Object.entries(summary.output).map(([uom, qty]) => `${quantity(qty)} ${uom}`).join(' · ') || '0';
  const slip = (month) => session.download(`/wages/payslips/${worker.id}?month=${month}`, `payslip-${worker.emp_code}-${month}.pdf`);

  return (
    <>
      <section className="panel my-id">
        <div className="my-id-avatar">{initials(worker.name)}</div>
        <dl className="my-id-facts">
          <div><dt>Employee code</dt><dd>{worker.emp_code}</dd></div>
          <div><dt>Skill</dt><dd>{worker.skill || '–'}</dd></div>
          <div><dt>Department</dt><dd>{worker.stage || '–'}</dd></div>
          <div><dt>Usual shift</dt><dd>{worker.default_shift ? `Shift ${worker.default_shift}` : '–'}</dd></div>
          <div><dt>Employment</dt><dd style={{ textTransform: 'capitalize' }}>{worker.employment_type}</dd></div>
          <div>
            <dt>Pay</dt>
            <dd>{money(worker.wage_type === 'piece' ? worker.piece_rate : worker.rate)} {WAGE_LABEL[worker.wage_type]}{Number(worker.ot_rate) > 0 && <small> · OT {money(worker.ot_rate)}/hr</small>}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading"><h2>Today</h2><span>{date(today.date)}</span></div>
        {today.assignments.length === 0 && today.attendance.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No machine assigned to you today." />
          : (
            <div className="my-today">
              {today.assignments.map((a) => (
                <div className="my-today-card" key={`${a.shift}-${a.machine}`}>
                  <div className="my-today-top">
                    <div><small>Shift {a.shift} · {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}</small><strong>{a.machine}{a.machine_name ? ` · ${a.machine_name}` : ''}</strong></div>
                    <Status value={a.machine_status} />
                  </div>
                  {a.wo_no ? (
                    <>
                      <div className="my-today-line">Work order <b>{a.wo_no}</b> for order <b>{a.order_no}</b></div>
                      <Progress percent={Math.min(100, Math.round((Number(a.produced_qty) / Number(a.target_qty)) * 100) || 0)} size="small" />
                      <div className="my-today-line">My output this shift: <b>{quantity(a.my_qty)} {a.uom}</b></div>
                    </>
                  ) : <div className="my-today-line muted">No work order on this machine right now.</div>}
                </div>
              ))}
              {today.attendance.map((a) => (
                <div className="my-today-card" key={`att-${a.shift}`}>
                  <div className="my-today-top"><div><small>Attendance · Shift {a.shift}</small><strong>In {time(a.check_in)} · Out {time(a.check_out)}</strong></div><Tag color={ATTENDANCE_COLOR[a.status]}>{label(a.status)}</Tag></div>
                  {a.late_min > 0 && <div className="my-today-line muted">{a.late_min} min late</div>}
                </div>
              ))}
            </div>
          )}
      </section>

      <div className="kpi-row">
        {[
          ['Days worked', quantity(summary.days)],
          ['Late', summary.late, summary.late ? 'var(--risk)' : undefined],
          ['Absent', summary.absent, summary.absent ? 'var(--danger)' : undefined],
          ['Hours', quantity(summary.hours)],
          ['Overtime', `${quantity(summary.ot_hours)} h`, undefined, summary.ot_pending ? `${quantity(summary.ot_pending)} h waiting approval` : null],
          ['My output', outputText],
          ['Estimated pay', money(summary.estimated_pay), 'var(--ok)', 'Before the wage run is approved'],
        ].map(([title, value, color, note]) => (
          <div className="kpi" key={title}><span>{title}</span><strong style={color ? { color } : undefined}>{value}</strong>{note && <small>{note}</small>}</div>
        ))}
      </div>

      <section className="panel">
        <Tabs items={[
          {
            key: 'attendance', label: `Attendance (${d.attendance.length})`,
            children: <Table size="small" rowKey={(r) => `${r.date}-${r.shift}`} dataSource={d.attendance} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 560 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attendance this month." /> }}
              columns={[
                { title: 'Date', dataIndex: 'date', render: date },
                { title: 'Shift', dataIndex: 'shift' },
                { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={ATTENDANCE_COLOR[v]}>{label(v)}</Tag> },
                { title: 'In', dataIndex: 'check_in', render: time },
                { title: 'Out', dataIndex: 'check_out', render: time },
                { title: 'Hours', dataIndex: 'worked_hours', align: 'right', render: quantity },
                { title: 'OT', dataIndex: 'ot_hours', align: 'right', render: (v, r) => (Number(v) ? <>{quantity(v)} {r.ot_approved ? <Tag color="green">approved</Tag> : <Tag>pending</Tag>}</> : '–') },
              ]} />,
          },
          {
            key: 'output', label: `My output (${d.output.length})`,
            children: <Table size="small" rowKey={(r) => `${r.logged_at}-${r.wo_no}`} dataSource={d.output} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 560 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No production logged against you this month." /> }}
              columns={[
                { title: 'When', dataIndex: 'logged_at', render: (v) => new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
                { title: 'Machine', dataIndex: 'machine' },
                { title: 'Shift', dataIndex: 'shift' },
                { title: 'Work order', dataIndex: 'wo_no' },
                { title: 'Order', dataIndex: 'order_no' },
                { title: 'Quantity', dataIndex: 'qty', align: 'right', render: (v, r) => `${quantity(v)} ${r.uom}` },
              ]} />,
          },
          {
            key: 'pay', label: 'Payslips',
            children: <Table size="small" rowKey="month" dataSource={d.payslips} pagination={false} scroll={{ x: 560 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No wage runs include you yet." /> }}
              columns={[
                { title: 'Month', dataIndex: 'month' },
                { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'paid' ? 'green' : v === 'approved' ? 'blue' : 'default'}>{v}</Tag> },
                { title: 'Days', dataIndex: 'days', align: 'right', render: quantity },
                { title: 'OT hours', dataIndex: 'ot_hours', align: 'right', render: quantity },
                { title: 'Gross', dataIndex: 'gross', align: 'right', render: money },
                { title: 'Net', dataIndex: 'net', align: 'right', render: (v) => <b>{money(v)}</b> },
                { title: '', key: 'pdf', render: (_, r) => <Button size="small" onClick={() => slip(r.month)}>PDF</Button> },
              ]} />,
          },
        ]} />
      </section>
    </>
  );
}
