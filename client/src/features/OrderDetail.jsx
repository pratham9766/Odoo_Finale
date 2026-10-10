import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Popconfirm, Table } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { PageTitle, QueryState, Status } from '@/components/States';
import { date, money, quantity } from '@/lib/format';
export default function OrderDetail() {
  const { id } = useParams();
  const session = useSession();
  const cache = useQueryClient();
  const key = [session.userId,'order',id];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => session.api(`/orders/${encodeURIComponent(id)}`, { signal }), refetchInterval: 30000 });
  const confirm = useMutation({ mutationFn: () => session.api(`/orders/${encodeURIComponent(id)}/confirm`, { method: 'POST' }), onSuccess: () => { cache.invalidateQueries({ queryKey: key }); cache.invalidateQueries({ queryKey: [session.userId,'orders'] }); cache.invalidateQueries({ queryKey: [session.userId,'stock'] }); } });
  const order = query.data?.data;
  const columns = [{ title: 'Item', dataIndex: 'description' },{ title: 'Colour', dataIndex: 'colour' },{ title: 'Quantity', dataIndex: 'qty', render: quantity },{ title: 'Unit', dataIndex: 'uom' },...(session.can('orders.view_price') ? [{ title: 'Rate', dataIndex: 'rate', render: money }] : [])];
  return <><Link to="/app/orders">← All orders</Link><PageTitle title={order?.order_no || 'Order details'} description="One record, from the initial request through production and delivery." action={order?.status === 'draft' && session.can('orders.confirm') && <Popconfirm title="Confirm this order and reserve available material?" onConfirm={() => confirm.mutate()}><Button type="primary" loading={confirm.isPending}>Confirm order</Button></Popconfirm>} /><section className="panel"><QueryState query={query}>{order && <>{confirm.isError && <Alert className="mb-4" type="error" message={confirm.error.message} />}<Descriptions column={{ xs: 1, sm: 2, md: 3 }} items={[{ key:'buyer',label:'Buyer',children:order.buyer_name },{ key:'deadline',label:'Deadline',children:date(order.deadline) },{ key:'status',label:'Status',children:<Status value={order.status} /> },{ key:'priority',label:'Priority',children:order.priority },{ key:'notes',label:'Notes',children:order.notes || '—' }]} /><h2>Fabric requirements</h2><Table rowKey="id" columns={columns} dataSource={order.lines || []} pagination={false} scroll={{ x: 500 }} /></>}</QueryState></section></>;
}
