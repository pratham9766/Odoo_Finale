import { Link } from 'react-router-dom';
import Icon from '@/components/Icons';
import { useSession } from '@/context/Session';
import { useGet } from '@/lib/hooks';

const REFRESH = 60000;
const total = (q) => Number(q.meta?.total ?? q.payload?.length ?? 0);

/**
 * One source of pending work, read from its existing list endpoint. Only `meta.total` is used (limit=1),
 * except maintenance, where the open tickets are read to find urgent ones.
 */
function useTask({ path, params, perms, enabled = true }) {
  const session = useSession();
  const allowed = perms.some((p) => session.can(p)) && enabled;
  const q = useGet(path, params, { enabled: allowed, refetchInterval: REFRESH });
  return { allowed, q };
}

export default function TodayTasks() {
  const receipts = useTask({ path: '/receipts', params: { status: 'draft', limit: 1 }, perms: ['receipt.view', 'stock.view'] });
  const unassigned = useTask({ path: '/work-orders', params: { status: 'planned', unassigned: true, limit: 1 }, perms: ['production.view', 'production.plan'] });
  const qc = useTask({ path: '/qc/queue', params: { status: 'pending_qc', limit: 1 }, perms: ['qc.view'] });
  const tickets = useTask({ path: '/maintenance/tickets', params: { status: 'open', limit: 100 }, perms: ['breakdown.report', 'maintenance.fix'] });
  const packing = useTask({ path: '/dispatches', params: { status: 'packing', limit: 1 }, perms: ['dispatch.view'] });
  const disputed = useTask({ path: '/dispatches', params: { status: 'disputed', limit: 1 }, perms: ['dispatch.view'] });

  const urgentTickets = (tickets.q.payload || []).filter((t) => t.priority === 'urgent' || t.priority === 'high').length;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  const rows = [
    { key: 'receipts', src: receipts, to: '/app/receipts', label: (n) => `Post ${plural(n, 'draft goods receipt')}`, priority: () => 'normal' },
    { key: 'wo', src: unassigned, to: '/app/work-orders', label: (n) => `Put ${plural(n, 'work order')} on a machine`, priority: () => 'normal' },
    { key: 'qc', src: qc, to: '/app/quality', label: (n) => `Inspect ${plural(n, 'roll')} waiting for QC`, priority: () => 'normal' },
    { key: 'maint', src: tickets, to: '/app/maintenance', label: (n) => `Handle ${plural(n, 'open maintenance ticket')}`, priority: () => (urgentTickets ? 'high' : 'normal'), note: urgentTickets ? `${urgentTickets} urgent` : null },
    { key: 'disputed', src: disputed, to: '/app/dispatch', label: (n) => `Resolve ${plural(n, 'disputed dispatch', 'disputed dispatches')}`, priority: () => 'high' },
    { key: 'packing', src: packing, to: '/app/dispatch', label: (n) => `Confirm ${plural(n, 'dispatch', 'dispatches')} being packed`, priority: () => 'normal' },
  ].filter((r) => r.src.allowed);

  const loading = rows.some((r) => r.src.q.isPending);
  const failed = rows.filter((r) => r.src.q.isError);
  const open = rows.filter((r) => r.src.q.isSuccess && total(r.src.q) > 0)
    .sort((a, b) => (a.priority() === 'high' ? 0 : 1) - (b.priority() === 'high' ? 0 : 1));

  return (
    <section className="ops-card" aria-labelledby="ops-tasks-title" aria-busy={loading}>
      <header className="ops-card-head">
        <h2 id="ops-tasks-title">Today’s tasks</h2>
        {!loading && open.length > 0 && <span className="ops-count">{open.length}</span>}
      </header>

      {rows.length === 0 && <p className="ops-empty">Your role has no task lists to follow here.</p>}
      {loading && <div className="ops-skeleton" aria-label="Loading tasks"><i /><i /><i /></div>}

      {!loading && (
        <ul className="task-list">
          {open.map((r) => {
            const n = total(r.src.q);
            const high = r.priority() === 'high';
            return (
              <li key={r.key}>
                <Link to={r.to} className="task-row">
                  <span className={`task-dot${high ? ' is-high' : ''}`} aria-hidden="true" />
                  <span className="task-text">{r.label(n)}{r.note && <small>{r.note}</small>}</span>
                  {high ? <span className="task-flag">High</span> : <span className="task-num">{n}</span>}
                  <Icon name="chevron" size={16} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && failed.length > 0 && (
        <div className="ops-error" role="alert">
          <span>Could not load {failed.length === 1 ? 'one task list' : `${failed.length} task lists`}.</span>
          <button type="button" onClick={() => failed.forEach((r) => r.src.q.refetch())}>Retry</button>
        </div>
      )}
      {!loading && rows.length > 0 && open.length === 0 && failed.length === 0 && (
        <p className="ops-empty"><Icon name="check" size={18} /> All caught up. Nothing is waiting right now.</p>
      )}
    </section>
  );
}
