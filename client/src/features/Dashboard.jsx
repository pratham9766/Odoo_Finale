import { Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import Icon from '@/components/Icons';
import OperationsPanel from '@/components/operations/OperationsPanel';
import { QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { useGet } from '@/lib/hooks';
import { usePageTitle } from '@/lib/title';
import { date, money, quantity } from '@/lib/format';

const RISK = { red: 'red', amber: 'orange', green: 'green' };

/** a headline number: label and value; `tone` tints the card (red / amber / ok), `ratio` draws a meter */
function Kpi({ label, value, tone, to, sub, ratio }) {
  const body = (
    <>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        {sub && <small>{sub}</small>}
        {ratio != null && <span className="kpi-meter" role="presentation"><i style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} /></span>}
      </div>
    </>
  );
  const cls = `kpi${tone ? ` kpi-${tone}` : ''}`;
  return to ? <Link className={cls} to={to}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Section({ title, note, link, children }) {
  return (
    <section className="dash-section">
      <header className="dash-section-head">
        <div><h2>{title}</h2><p>{note}</p></div>
        {link && <Link className="dash-section-link" to={link.to}>{link.label}<Icon name="arrow" size={17} /></Link>}
      </header>
      {children}
    </section>
  );
}

/** last 7 days of output, one bar per day (units differ by stage, so each stage has its own scale) */
function Last7({ rows }) {
  const stages = [...new Set(rows.map((r) => r.stage))];
  return (
    <div className="grid-2">
      {stages.map((stage) => {
        const mine = rows.filter((r) => r.stage === stage);
        const max = Math.max(...mine.map((r) => Number(r.qty)), 1);
        return (
          <div key={stage}>
            <strong>{stage}</strong> <span className="muted">{mine[0].uom}</span>
            <div className="bars">
              {mine.map((r) => (
                <div key={`${r.day}`} className="bar" title={`${String(r.day).slice(0, 10)}: ${quantity(r.qty)}`}>
                  <i style={{ height: `${Math.max(4, (Number(r.qty) / max) * 100)}%` }} /><small>{String(r.day).slice(8, 10)}</small>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const session = useSession();
  const q = useGet('/reports/dashboard', {}, { refetchInterval: 30000 });
  const d = q.payload;
  const a = d?.alerts || {};
  const alerts = [
    a.low_stock > 0 && { type: 'warning', text: `${a.low_stock} material${a.low_stock > 1 ? 's' : ''} below reorder level`, to: '/app/stock' },
    a.machines_down?.length > 0 && { type: 'error', text: `Machines down: ${a.machines_down.join(', ')}`, to: '/app/maintenance' },
    a.overdue?.invoices > 0 && { type: 'error', text: `${a.overdue.invoices} overdue invoice${a.overdue.invoices > 1 ? 's' : ''}: ${money(a.overdue.amount)} to collect`, to: '/app/finance' },
    a.unmoved_rolls > 0 && { type: 'info', text: `${a.unmoved_rolls} finished roll${a.unmoved_rolls > 1 ? 's' : ''} have not moved for a week`, to: '/app/stock' },
  ].filter(Boolean);

  const ratio = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : 0);
  const name = session.context.user?.full_name || session.context.role.name;

  return (
    <div className="dash-layout">
    <div className="dashboard">
      <header className="dash-hero">
        <div className="eyebrow">{session.context.mill.name}</div>
        <h1>Dashboard</h1>
        <p>Welcome, {name}. Here is the mill right now.</p>
      </header>
      <QueryState query={q}>
        {d && (
          <>
            <div className="dash-alerts">
              {alerts.map((x) => (
                <Link key={x.text} to={x.to} className={`dash-alert dash-alert-${x.type}`}>
                  <span className="dash-alert-text">{x.text}</span>
                  <Icon name="chevron" size={18} />
                </Link>
              ))}
              {alerts.length === 0 && (
                <div className="dash-alert dash-alert-success">
                  <span className="dash-alert-text">Nothing needs attention right now</span>
                </div>
              )}
            </div>

            {d.orders && (
              <Section title="Order Health" note="Overview of current order status and progress." link={{ to: '/app/orders', label: 'View all orders' }}>
                <div className="kpi-row">
                  <Kpi label="Orders in progress" value={d.orders.in_progress} to="/app/orders" />
                  <Kpi label="Late (red)" value={d.orders.red} tone="red" to="/app/orders" />
                  <Kpi label="At risk (amber)" value={d.orders.amber} tone="amber" to="/app/orders" />
                  <Kpi label="On track" value={d.orders.green} tone="ok" to="/app/orders" />
                </div>
              </Section>
            )}
            {d.production && (
              <Section title="Shop Floor" note="Live machine status and production performance." link={{ to: '/app/production', label: 'View machine board' }}>
                <div className="kpi-row">
                  <Kpi label="Machines running" value={`${d.production.running} / ${d.production.total}`} ratio={ratio(d.production.running, d.production.total)} to="/app/production" />
                  <Kpi label="Breakdown" value={d.production.breakdown} tone={d.production.breakdown ? 'red' : undefined} to="/app/production" />
                  <Kpi label="Utilisation" value={`${d.production.utilisation_pct}%`} />
                  {Object.entries(d.production.today || {}).map(([uom, qty]) => <Kpi key={uom} label="Output today" value={`${quantity(qty)} ${uom}`} />)}
                </div>
              </Section>
            )}
            {d.attendance && (
              <Section title="Workforce" note="Today's attendance and work hours." link={{ to: '/app/attendance', label: 'View attendance' }}>
                <div className="kpi-row">
                  <Kpi label="Present today" value={`${d.attendance.present} / ${d.attendance.expected}`} ratio={ratio(d.attendance.present, d.attendance.expected)} to="/app/attendance" />
                  <Kpi label="Absent" value={d.attendance.absent} tone={d.attendance.absent ? 'red' : undefined} to="/app/attendance" />
                  <Kpi label="Late" value={d.attendance.late} />
                  <Kpi label="Overtime hours" value={d.attendance.ot_hours} />
                </div>
              </Section>
            )}
            {d.finance && (
              <Section title="Finance" note="Financial performance this month." link={{ to: '/app/reports', label: 'View reports' }}>
                <div className="kpi-row kpi-row-wide">
                  <Kpi label="Revenue this month" value={money(d.finance.revenue)} to="/app/reports" />
                  <Kpi label="Net profit" value={money(d.finance.net_profit)} tone={d.finance.net_profit < 0 ? 'red' : 'ok'} to="/app/reports"
                    sub={d.finance.change_pct != null ? `${d.finance.change_pct > 0 ? '+' : ''}${d.finance.change_pct}% vs last month` : undefined} />
                </div>
              </Section>
            )}

            {d.orders?.needs_attention?.length > 0 && (
              <section className="panel dash-panel"><h3>Orders that need attention</h3>
                <Table rowKey="id" size="small" pagination={false} dataSource={d.orders.needs_attention} scroll={{ x: 640 }}
                  columns={[
                    { title: 'Order', dataIndex: 'order_no', render: (v, r) => <Link to={`/app/orders/${r.id}`}><strong>{v}</strong></Link> },
                    { title: 'Risk', dataIndex: 'risk', render: (v) => <Tag color={RISK[v]}>{v}</Tag> }, { title: 'Status', dataIndex: 'status', render: (v) => v.replaceAll('_', ' ') },
                    { title: 'Progress', dataIndex: 'progress_pct', render: (v) => `${v ?? 0}%` }, { title: 'Deadline', dataIndex: 'deadline', render: date }, { title: 'Expected', dataIndex: 'expected_completion', render: date },
                  ]} />
              </section>
            )}
            {d.production?.last_7_days?.length > 0 && <section className="panel dash-panel"><h3>Output, last 7 days</h3><Last7 rows={d.production.last_7_days} /></section>}
            {!d.orders && !d.production && !d.attendance && !d.finance && <section className="panel"><p>Your role has no dashboard widgets yet. Use the menu to open the screens you can access.</p></section>}
          </>
        )}
      </QueryState>
    </div>
    <OperationsPanel />
    </div>
  );
}
