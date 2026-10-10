import { Alert, Table } from 'antd';
import { money, quantity } from '@/lib/format';

/** "Do we have enough?": what must still be bought, and what must be made first, after netting off the stock */
export default function MaterialSummary({ summary }) {
  if (!summary) return null;
  const buy = summary.buy_list || [];
  const make = summary.produce_list || [];
  const hasCost = buy.some((b) => b.est_cost !== undefined);
  return (
    <>
      {buy.length === 0
        ? <Alert type="success" showIcon message="Enough material in stock" description="Everything needed is on hand or already reserved." style={{ marginBottom: 12 }} />
        : <Alert type="warning" showIcon message={`${buy.length} material${buy.length > 1 ? 's' : ''} short`} description="Buy these before production can start." style={{ marginBottom: 12 }} />}
      {buy.length > 0 && (
        <Table size="small" rowKey="item_id" pagination={false} dataSource={buy} style={{ marginBottom: 12 }}
          columns={[
            { title: 'To buy', dataIndex: 'name' },
            { title: 'Quantity', dataIndex: 'qty', align: 'right', render: quantity }, { title: 'Unit', dataIndex: 'uom', width: 70 },
            ...(hasCost ? [{ title: 'Est. cost', dataIndex: 'est_cost', align: 'right', render: money }] : []),
          ]}
          summary={hasCost && summary.material_cost_estimate !== undefined ? () => (
            <Table.Summary.Row><Table.Summary.Cell colSpan={3}><strong>Estimated material cost</strong></Table.Summary.Cell><Table.Summary.Cell align="right"><strong>{money(summary.material_cost_estimate)}</strong></Table.Summary.Cell></Table.Summary.Row>
          ) : undefined}
        />
      )}
      {make.length > 0 && (
        <Table size="small" rowKey={(r) => `${r.item_id}-${r.stage_id}`} pagination={false} dataSource={make}
          columns={[{ title: 'To produce in the mill', dataIndex: 'name' }, { title: 'Quantity', dataIndex: 'to_make', align: 'right', render: quantity }, { title: 'Unit', dataIndex: 'uom', width: 70 }]} />
      )}
    </>
  );
}
