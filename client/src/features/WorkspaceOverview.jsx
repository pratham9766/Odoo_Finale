import { Alert, Descriptions, Tag } from 'antd';
import { useSession } from '@/context/Session';

export default function WorkspaceOverview() {
  const { context } = useSession();
  return <><div className="page-title"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>{context.org.name}</h1><p>You are signed in as {context.role.name}.</p></div></div><section className="panel"><Descriptions column={1} items={[
    { key: 'type', label: 'Organization type', children: context.org.types.join(', ') },
    { key: 'status', label: 'Status', children: context.org.status },
    { key: 'role', label: 'Role', children: context.role.name },
  ]} /><Alert className="mb-4" type="info" showIcon message="Your account is connected" description="The current frontend includes manufacturer orders, inventory and production views. Other role-specific screens are still under development; signing in does not grant additional permissions." /><h2>Assigned permissions</h2><div>{context.permissions.map(permission => <Tag key={permission}>{permission}</Tag>)}</div></section></>;
}
