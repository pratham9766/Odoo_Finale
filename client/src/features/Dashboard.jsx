import { Alert, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { useGet } from '@/lib/hooks';
import { date, money, quantity } from '@/lib/format';

const RISK = { red: 'red', amber: 'orange', green: 'green' };

function Kpi({ label, value, color, to, sub }) {
  const body = <><span>{label}</span><strong style={color ? { color } : undefined}>{value}</strong>{sub && <small>{sub}</small>}</>;
  return to ? <Link className="kpi" to={to}>{body}</Link> : <div className="kpi">{body}</div>;
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
            <strong>{stage}</strong> <span style={{ color: '#828ea8' }}>{mine[0].uom}</span>
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

  return (
    <>
      <PageTitle eyebrow={session.context.mill.name.toUpperCase()} title="Dashboard" description={`Welcome, ${session.context.user?.full_name || session.context.role.name}. Here is the mill right now.`} />
      <QueryState query={q}>
        {d && (
          <>
            {alerts.map((x) => <Link key={x.text} to={x.to}><Alert style={{ marginBottom: 8 }} type={x.type} showIcon message={x.text} /></Link>)}
            {alerts.length === 0 && <Alert style={{ marginBottom: 8 }} type="success" showIcon message="Nothing needs attention right now" />}

            {d.orders && (
              <div className="kpi-row">
                <Kpi label="Orders in progress" value={d.orders.in_progress} to="/app/orders" />
                <Kpi label="Late (red)" value={d.orders.red} color={d.orders.red ? '#cf1322' : undefined} to="/app/orders" />
                <Kpi label="At risk (amber)" value={d.orders.amber} color={d.orders.amber ? '#d48806' : undefined} to="/app/orders" />
                <Kpi label="On track" value={d.orders.green} color="#389e0d" to="/app/orders" />
              </div>
            )}
            {d.production && (
              <div className="kpi-row">
                <Kpi label="Machines running" value={`${d.production.running} / ${d.production.total}`} color="#389e0d" to="/app/production" />
                <Kpi label="Breakdown" value={d.production.breakdown} color={d.production.breakdown ? '#cf1322' : undefined} to="/app/production" />
                <Kpi label="Utilisation" value={`${d.production.utilisation_pct}%`} />
                {Object.entries(d.production.today || {}).map(([uom, qty]) => <Kpi key={uom} label="Output today" value={`${quantity(qty)} ${uom}`} />)}
              </div>
            )}
            {d.attendance && (
              <div className="kpi-row">
                <Kpi label="Present today" value={`${d.attendance.present} / ${d.attendance.expected}`} color="#389e0d" to="/app/attendance" />
                <Kpi label="Absent" value={d.attendance.absent} color={d.attendance.absent ? '#cf1322' : undefined} to="/app/attendance" />
                <Kpi label="Late" value={d.attendance.late} />
                <Kpi label="Overtime hours" value={d.attendance.ot_hours} />
              </div>
            )}
            {d.finance && (
              <div className="kpi-row">
                <Kpi label="Revenue this month" value={money(d.finance.revenue)} to="/app/reports" />
                <Kpi label="Net profit" value={money(d.finance.net_profit)} color={d.finance.net_profit < 0 ? '#cf1322' : '#389e0d'} to="/app/reports"
                  sub={d.finance.change_pct != null ? `${d.finance.change_pct > 0 ? '+' : ''}${d.finance.change_pct}% vs last month` : undefined} />
              </div>
            )}

            {d.orders?.needs_attention?.length > 0 && (
              <section className="panel"><h3>Orders that need attention</h3>
                <Table rowKey="id" size="small" pagination={false} dataSource={d.orders.needs_attention}
                  columns={[
                    { title: 'Order', dataIndex: 'order_no', render: (v, r) => <Link to={`/app/orders/${r.id}`}><strong>{v}</strong></Link> },
                    { title: 'Risk', dataIndex: 'risk', render: (v) => <Tag color={RISK[v]}>{v}</Tag> }, { title: 'Status', dataIndex: 'status', render: (v) => v.replaceAll('_', ' ') },
                    { title: 'Progress', dataIndex: 'progress_pct', render: (v) => `${v ?? 0}%` }, { title: 'Deadline', dataIndex: 'deadline', render: date }, { title: 'Expected', dataIndex: 'expected_completion', render: date },
                  ]} />
              </section>
            )}
            {d.production?.last_7_days?.length > 0 && <section className="panel"><h3>Output, last 7 days</h3><Last7 rows={d.production.last_7_days} /></section>}
            {!d.orders && !d.production && !d.attendance && !d.finance && <section className="panel"><p>Your role has no dashboard widgets yet. Use the menu to open the screens you can access.</p></section>}
          </>
        )}
      </QueryState>
    </>
  );
}
