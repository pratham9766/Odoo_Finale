import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
export function QueryState({ query, children }) {
  if (query.isPending) return <Skeleton active paragraph={{ rows: 5 }} />;
  if (query.isError) return <Alert type="error" showIcon message="Unable to load this information" description={query.error.message} action={<Button onClick={() => query.refetch()}>Retry</Button>} />;
  return children;
}
export function NoData({ description = 'No records yet.' }) { return <Empty description={description} />; }
export function Status({ value }) {
  const color = ['passed','delivered','material_ready','running'].includes(value) ? 'green' : ['breakdown','rejected','cancelled'].includes(value) ? 'red' : ['draft','idle'].includes(value) ? 'default' : 'blue';
  return <Tag color={color}>{(value || 'Unknown').replaceAll('_', ' ')}</Tag>;
}
export function PageTitle({ eyebrow = 'MILL OPERATIONS', title, description, action }) { return <header className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
