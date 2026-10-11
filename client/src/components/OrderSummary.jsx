// KPI cards, order-health donut, today's dispatch and attention widgets for the Orders page.
// Every number comes from the server (see GET /orders/summary).
import { Link } from 'react-router-dom';
import { quantity } from '@/lib/format';

// Every number here comes from GET /orders/summary (counts over all orders, not just the page on screen).

const KPIS = [
  { key: 'open', label: 'Open Orders', tone: 'green', stroke: '#16a34a', badIfUp: false,
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></> },
  { key: 'in_production', label: 'In Production', tone: 'blue', stroke: '#2563eb', badIfUp: false,
    icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></> },
  { key: 'ready_to_dispatch', label: 'Ready to Dispatch', tone: 'amber', stroke: '#d97706', badIfUp: false,
    icon: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></> },
  { key: 'delayed', label: 'Delayed', tone: 'red', stroke: '#dc2626', badIfUp: true,
    icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
];

const W = 60, H = 20, PAD = 2;

/** a line through the weekly counts, scaled to the 60×20 box */
function Sparkline({ values, stroke }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => `${(PAD + i * step).toFixed(1)},${(H - PAD - (v / max) * (H - PAD * 2)).toFixed(1)}`);
  return (
    <svg className="kpi-sparkline" viewBox={`0 0 ${W} ${H}`} fill="none" role="img" aria-label={`Orders placed per week: ${values.join(', ')}`}>
      <polyline points={points.join(' ')} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Trend({ kpi, badIfUp }) {
  const { change_pct: pct, this_month: now, last_month: before } = kpi;
  const title = `${now} placed this month, ${before} last month, now in this state`;
  if (pct == null) return <span className="kpi-trend-pill positive" title={title}>{now} new <span className="kpi-trend-context">this month</span></span>;
  const bad = badIfUp ? pct > 0 : pct < 0;
  return (
    <span className={`kpi-trend-pill ${bad ? 'warning' : 'positive'}`} title={title}>
      {pct >= 0 ? '↑ +' : '↓ '}{pct}% <span className="kpi-trend-context">vs last month</span>
    </span>
  );
}

export function KpiRow({ summary }) {
  return (
    <section className="kpi-summary-row" aria-label="Orders Summary Metrics">
      {KPIS.map((k) => {
        const kpi = summary.kpis[k.key];
        return (
          <Link key={k.key} to={`/app/orders?bucket=${k.key}`} className="kpi-card">
            <div className="kpi-card-top">
              <div className={`kpi-icon-square ${k.tone}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{k.icon}</svg>
              </div>
              <div className="kpi-numbers-wrap">
                <span className="kpi-value">{kpi.value}</span>
                <span className="kpi-label">{k.label}</span>
              </div>
            </div>
            <div className="kpi-card-bottom">
              <Trend kpi={kpi} badIfUp={k.badIfUp} />
              <Sparkline values={kpi.weekly} stroke={k.stroke} />
            </div>
          </Link>
        );
      })}
    </section>
  );
}

const CIRC = 2 * Math.PI * 38;
const HEALTH = [
  { key: 'green', label: 'On track', stroke: '#16a34a' },
  { key: 'amber', label: 'At risk', stroke: '#d97706' },
  { key: 'red', label: 'Delayed', stroke: '#dc2626' },
];

function HealthWidget({ health }) {
  const total = Math.max(health.total, 1);
  let offset = 0;
  const arcs = HEALTH.map((h) => {
    const length = (health[h.key] / total) * CIRC;
    const arc = { ...h, length, offset: -offset, count: health[h.key], pct: Math.round((health[h.key] / total) * 100) };
    offset += length;
    return arc;
  });
  return (
    <div className="orders-widget-card">
      <div className="widget-card-header">
        <h3 className="widget-card-title">Order health</h3>
        <Link to="/app/orders" className="widget-view-all-link">View all →</Link>
      </div>
      <div className="order-health-body">
        <div className="donut-chart-wrapper">
          <svg className="donut-chart-svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" strokeWidth="12" />
            {arcs.map((a) => (
              <circle key={a.key} cx="50" cy="50" r="38" fill="none" stroke={a.stroke} strokeWidth="12"
                strokeDasharray={`${a.length} ${CIRC}`} strokeDashoffset={a.offset} />
            ))}
          </svg>
          <div className="donut-center-text">
            <span className="donut-center-num">{health.total}</span>
            <span className="donut-center-lbl">Active orders</span>
          </div>
        </div>
        <div className="health-legend-list">
          {arcs.map((a) => (
            <div key={a.key} className="health-legend-row">
              <span className="health-legend-label"><span className={`dot ${a.key}`} /> {a.label}</span>
              <div className="health-legend-nums">
                <span className="health-legend-count">{a.count}</span>
                <span className="health-legend-pct">{a.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DispatchWidget({ today }) {
  return (
    <div className="orders-widget-card">
      <div className="widget-card-header">
        <h3 className="widget-card-title">Today&apos;s dispatch</h3>
        <Link to="/app/dispatch" className="widget-view-all-link">View all →</Link>
      </div>
      <div className="dispatch-summary-strip">
        <div className="dispatch-stat-col">
          <span className="dispatch-stat-num">{today.count}</span>
          <span className="dispatch-stat-lbl">Trucks today</span>
        </div>
        <div className="dispatch-stat-col">
          <span className="dispatch-stat-num">{quantity(today.total_qty)} m</span>
          <span className="dispatch-stat-lbl">Total quantity</span>
        </div>
      </div>
      <div className="dispatch-items-list">
        {today.items.length > 0 ? today.items.map((d) => (
          <Link key={d.dispatch_no} to={`/app/orders/${d.id}`} className="dispatch-item-card">
            <div className="dispatch-truck-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <div className="dispatch-item-mid">
              <div className="dispatch-item-ord-no">{d.order_no}</div>
              <div className="dispatch-item-buyer">{d.buyer_name}</div>
            </div>
            <div className="dispatch-item-right">
              <div className="dispatch-item-qty">{quantity(d.qty)} m</div>
              <div className="dispatch-item-fabric">{d.fabric_name}</div>
            </div>
            <span className="dispatch-chevron-icon">›</span>
          </Link>
        )) : <p className="muted dispatch-empty">No dispatches today</p>}
      </div>
    </div>
  );
}

function AttentionWidget({ delayed }) {
  return (
    <div className="orders-widget-card attention-widget-card">
      <div className="widget-card-header attention-widget-header">
        <div className="attention-widget-head">
          <span className="attention-icon-bulb">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" />
            </svg>
          </span>
          <h4 className="attention-widget-title">Attention needed</h4>
        </div>
        <Link to="/app/orders?bucket=delayed" className="widget-view-all-link attention-widget-link">View all →</Link>
      </div>
      <p className="attention-widget-text">
        {delayed > 0
          ? `${delayed} order${delayed > 1 ? 's are' : ' is'} delayed. Review and take action to keep deliveries on track.`
          : 'All active commitments are currently on track. No immediate action required.'}
      </p>
    </div>
  );
}

export function OrderWidgets({ summary }) {
  return (
    <aside className="orders-widgets-column">
      <DispatchWidget today={summary.dispatch_today} />
      <HealthWidget health={summary.health} />
      <AttentionWidget delayed={summary.kpis.delayed.value} />
    </aside>
  );
}
