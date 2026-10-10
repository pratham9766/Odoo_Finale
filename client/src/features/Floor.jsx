import { Tabs } from 'antd';
import Attendance from '@/features/Attendance';
import { Assignments } from '@/features/Production';
import { PageTitle } from '@/components/States';
import { useSession } from '@/context/Session';

/** the supervisor's tablet screen: who is on which machine, and who turned up */
export default function FloorSupervisor() {
  const session = useSession();
  return (
    <>
      <PageTitle title="My shift" description="Put workers on machines, then mark attendance." />
      <Tabs items={[
        ...(session.can('assignment.create') ? [{ key: 'assign', label: 'Assign workers', children: <Assignments embedded /> }] : []),
        { key: 'attendance', label: 'Attendance', children: <Attendance floor /> },
      ]} />
    </>
  );
}
