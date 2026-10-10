import { Alert, Descriptions, Tag } from 'antd';
import { useSession } from '@/context/Session';

export default function WorkspaceOverview() {
  const { context } = useSession();
  return <><div className="page-title"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>{context.mill.name}</h1><p>You are signed in as {context.role.name}.</p></div></div><section className="panel"><Descriptions column={1} items={[
    { key: 'user', label: 'Signed in as', children: context.user?.full_name || context.user?.email },
    { key: 'role', label: 'Role', children: context.role.name },
  ]} />{context.permissions.length === 0 && <Alert className="mb-4" type="info" showIcon message="No permissions yet" description="Your role has no permissions. Ask the mill owner to update it in Roles & permissions." />}<h2>Your permissions</h2><div>{context.permissions.map(permission => <Tag key={permission}>{permission}</Tag>)}</div></section></>;
}
