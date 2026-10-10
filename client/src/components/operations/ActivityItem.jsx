import { Link } from 'react-router-dom';
import Icon from '@/components/Icons';

// How an audit-log row reads in the feed. Unknown tables fall back to a plain "<action> · <table>" line.
const TABLES = {
  orders: { icon: 'cart', noun: 'Order', ref: (a) => a?.order_no, link: (id) => id && `/app/orders/${id}` },
  goods_receipts: { icon: 'box', noun: 'Goods receipt', ref: (a) => a?.grn_no, link: (id) => id && `/app/receipts/${id}` },
  purchase_orders: { icon: 'receipt', noun: 'Purchase order', ref: (a) => a?.po_no },
  work_orders: { icon: 'clipboard', noun: 'Work order', link: () => '/app/work-orders' },
  assignments: { icon: 'people', noun: 'Shift assignments', link: () => '/app/assignments' },
  machines: { icon: 'gear', noun: 'Machine', ref: (a) => a?.code, link: () => '/app/machines' },
  maintenance_tickets: { icon: 'wrench', noun: 'Maintenance ticket', link: () => '/app/maintenance' },
  rolls: { icon: 'check', noun: 'Roll QC', ref: (a) => a?.roll_no },
  stock_adjustments: { icon: 'layers', noun: 'Stock adjustment', link: () => '/app/stock' },
  items: { icon: 'box', noun: 'Item', ref: (a) => a?.name, link: () => '/app/items' },
  boms: { icon: 'layers', noun: 'Recipe (BOM)', link: () => '/app/boms' },
  workers: { icon: 'person', noun: 'Worker', link: () => '/app/workers' },
  wage_runs: { icon: 'wallet', noun: 'Wage run', link: () => '/app/wages' },
  expenses: { icon: 'bank', noun: 'Expense', link: () => '/app/finance' },
  staff_invites: { icon: 'people', noun: 'Staff invite', link: () => '/app/staff' },
  profiles: { icon: 'person', noun: 'Staff profile' },
  roles: { icon: 'shield', noun: 'Role', ref: (a) => a?.name, link: () => '/app/roles' },
};

const VERBS = { create: 'created', update: 'updated', delete: 'deleted', post: 'posted', confirm: 'confirmed', cancel: 'cancelled', plan: 'planned', approve: 'approved', send: 'sent', save: 'saved', request: 'requested', reject: 'rejected', deactivate: 'deactivated', invite: 'sent', revoke: 'revoked', invite_accepted: 'accepted', qc_override: 'QC overridden', respond: 'answered' };
const words = (s = '') => s.replaceAll('_', ' ');

export function relativeTime(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(t));
}

/** one audit-log row: icon, what happened, who, when */
export default function ActivityItem({ entry }) {
  const kind = TABLES[entry.table_name];
  const ref = kind?.ref?.(entry.after) || kind?.ref?.(entry.before);
  const title = kind
    ? `${kind.noun}${ref ? ` ${ref}` : ''} ${VERBS[entry.action] || words(entry.action)}`
    : `${words(entry.action)} · ${words(entry.table_name)}`;
  const to = kind?.link && entry.action !== 'delete' ? kind.link(entry.record_id) : null;
  const when = new Date(entry.created_at);
  const valid = !Number.isNaN(when.getTime());
  const body = (
    <>
      <span className="activity-icon"><Icon name={kind?.icon || 'clipboard'} size={19} /></span>
      <span className="activity-text">
        <strong>{title}</strong>
        <small>{entry.user_email ? `by ${entry.user_email}` : 'by the system'}</small>
      </span>
      <time dateTime={valid ? when.toISOString() : undefined} title={valid ? when.toLocaleString('en-IN') : undefined}>{relativeTime(entry.created_at)}</time>
    </>
  );
  return <li>{to ? <Link to={to} className="activity-row">{body}</Link> : <div className="activity-row">{body}</div>}</li>;
}
