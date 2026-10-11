// Dashboard feed of the latest changes, read from the audit log (only roles that may view it see the feed).
import { useSession } from '@/context/Session';
import { useGet } from '@/lib/hooks';
import ActivityItem from './ActivityItem';

// The feed is the mill's audit log (GET /audit-logs). The server only lets roles.view read it, so other
// roles see a note instead of a feed. There is no audit-log screen yet, so there is no "View all".
export default function RecentActivity() {
  const session = useSession();
  const allowed = session.can('roles.view');
  const q = useGet('/audit-logs', { limit: 6 }, { enabled: allowed, refetchInterval: 60000 });
  const rows = q.payload || [];

  return (
    <section className="ops-card" aria-labelledby="ops-activity-title" aria-busy={allowed && q.isPending}>
      <header className="ops-card-head"><h2 id="ops-activity-title">Recent activity</h2></header>
      {!allowed && <p className="ops-empty">The activity log is visible to roles that manage staff and permissions.</p>}
      {allowed && q.isPending && <div className="ops-skeleton" aria-label="Loading activity"><i /><i /><i /><i /></div>}
      {allowed && q.isError && (
        <div className="ops-error" role="alert">
          <span>{q.error.status === 403 ? 'Your role cannot read the activity log.' : 'Could not load recent activity.'}</span>
          {q.error.status !== 403 && <button type="button" onClick={() => q.refetch()}>Retry</button>}
        </div>
      )}
      {allowed && q.isSuccess && rows.length === 0 && <p className="ops-empty">No activity recorded yet.</p>}
      {allowed && rows.length > 0 && <ul className="activity-list">{rows.map((e) => <ActivityItem key={e.id} entry={e} />)}</ul>}
    </section>
  );
}
