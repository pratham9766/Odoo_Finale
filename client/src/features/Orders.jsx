import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Table } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { NoData, PageTitle, QueryState, Status } from '@/components/States';
import { date } from '@/lib/format';
export default function Orders() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = params.get('status') || '';
  const q = params.get('q') || '';
  const query = useQuery({ queryKey: [session.userId, session.orgId, 'orders', page, status, q], queryFn: ({ signal }) => session.api(`/orders?${new URLSearchParams({ page, limit: 25, status, q })}`, { signal }), refetchInterval: 30000 });
  function update(values) { setParams({ q, status, page: '1', ...values }); }
  const columns = [{ title: 'Order', dataIndex: 'order_no', render: (value,row) => <Link className="record-link" to={`/app/orders/${row.id}`}>{value}</Link> }, { title: 'Buyer', dataIndex: 'buyer_name' }, { title: 'Deadline', dataIndex: 'deadline', render: date }, { title: 'Status', dataIndex: 'status', render: value => <Status value={value} /> }, { title: 'Priority', dataIndex: 'priority' }];
  return <><PageTitle title="Orders" description="Keep every commitment in view, from confirmation to dispatch." action={session.can('orders.create') && <Link to="/app/orders/new"><Button type="primary" size="large">+ Create order</Button></Link>} /><section className="panel"><div className="panel-heading"><h2>Order register</h2><span>Updates every 30 seconds</span></div><div className="filters"><Input.Search key={q} aria-label="Search orders" placeholder="Search order or buyer" defaultValue={q} onSearch={value => update({ q: value })} allowClear /><Select aria-label="Filter by order status" value={status} onChange={value => update({ status: value })} options={[{ value: '', label: 'All statuses' }, ...['draft','waiting_material','material_ready','in_production','in_qc','ready_to_ship','partially_dispatched','dispatched','delivered'].map(value => ({ value, label: value.replaceAll('_',' ') }))]} /><Button onClick={() => query.refetch()} loading={query.isFetching}>Refresh</Button></div><QueryState query={query}><Table rowKey="id" columns={columns} dataSource={query.data?.data || []} locale={{ emptyText: <NoData description="No orders match this view. Create an order to get started." /> }} scroll={{ x: 720 }} pagination={{ current: page, pageSize: 25, total: query.data?.meta?.total || 0, showSizeChanger: false, onChange: value => update({ page: String(value) }) }} /></QueryState></section></>;
}
