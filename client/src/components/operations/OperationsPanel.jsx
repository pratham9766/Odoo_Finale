// Right-hand column of the dashboard: quick actions, today's tasks and recent activity.
import QuickActions from './QuickActions';
import RecentActivity from './RecentActivity';
import TodayTasks from './TodayTasks';

/** right-hand column of the dashboard: shortcuts, pending work, and the latest changes */
export default function OperationsPanel() {
  return (
    <aside className="ops-panel" aria-label="Operations">
      <QuickActions />
      <TodayTasks />
      <RecentActivity />
    </aside>
  );
}
