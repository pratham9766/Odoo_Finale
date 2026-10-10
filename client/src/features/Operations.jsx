import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Table } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/context/Session';
import { NoData, PageTitle, QueryState, Status } from '@/components/States';
import { quantity } from '@/lib/format';
export default function Operations({ kind }) {
  const session = useSession();
  const [params,setParams] = useSearchParams();
  const page = Math.max(1,Number(params.get('page')) || 1);
  const stock = kind === 'stock';
  const query = useQuery({ queryKey: [session.userId,kind,page], queryFn: ({ signal }) => session.api(stock ? `/stock?page=${page}&limit=25` : '/production/board', { signal }), refetchInterval: 30000 });
  const rows = (stock ? query.data?.data : query.data?.data?.machines) || [];
  const columns = [{title:'Material',dataIndex:'name'},{title:'Colour',dataIndex:'colour'},...['on_hand','reserved','available','reorder_level'].map(key => ({title:key.replaceAll('_',' '),dataIndex:key,render:quantity})),{title:'Unit',dataIndex:'uom'}];
  return <><PageTitle title={stock ? 'Material inventory' : 'Production floor'} description={stock ? 'Know what is on hand, reserved and ready for the next order.' : 'See machine activity and today’s output across the mill.'} action={<Button onClick={() => query.refetch()} loading={query.isFetching}>Refresh</Button>} /><section className="panel"><QueryState query={query}>{stock ? <>{rows.some(row => Number(row.available) < Number(row.reorder_level)) && <Alert className="mb-4" type="warning" showIcon message="Materials below reorder level" description="Review the highlighted rows before planning production. This alert covers the current page." />}<Table rowKey="item_id" columns={columns} dataSource={rows} rowClassName={row => Number(row.available) < Number(row.reorder_level) ? 'low-stock' : ''} locale={{emptyText:<NoData description="No stock records yet. Post a goods receipt to populate inventory." />}} scroll={{x:760}} pagination={{current:page,pageSize:25,total:query.data?.meta?.total || 0,showSizeChanger:false,onChange:p => setParams({page:String(p)})}} /></> : rows.length ? <div className="machine-grid">{rows.map(machine => <article className="machine-card" key={machine.machine_id}><div className="machine-card-head"><h2>{machine.code}</h2><Status value={machine.status} /></div><p>{machine.stage}</p><dl><dt>Order</dt><dd>{machine.order_no || 'Unassigned'}</dd><dt>Operator</dt><dd>{machine.operator || 'Unassigned'}</dd></dl><div className="output"><strong>{quantity(machine.today_qty)}</strong> {machine.uom || ''}<span>Recorded today</span></div></article>)}</div> : <NoData description="No machines configured yet." />}</QueryState></section></>;
}
