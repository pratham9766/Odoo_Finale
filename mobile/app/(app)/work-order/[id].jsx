import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import WorkOrderActions from '../../../src/components/WorkOrderActions';
import { useGet } from '../../../src/lib/hooks';
import { Facts, PageTitle, Panel, Pill, Progress, QueryState, Screen } from '../../../src/components/ui';
import { date, quantity } from '../../../src/utils/format';

export default function WorkOrderDetail() {
  return <Gate perms="production.view"><Body /></Gate>;
}

function Body() {
  const { id } = useLocalSearchParams();
  const wo = useGet(`/work-orders/${id}`);
  const w = wo.payload;
  return (
    <Screen onRefresh={wo.refetch} refreshing={wo.isRefetching}>
      <QueryState query={wo}>
        {w && (
          <>
            <PageTitle eyebrow={w.is_rework ? 'REWORK' : 'WORK ORDER'} title={w.wo_no} description={`${w.item} · ${w.stage}`} right={<Pill value={w.status} />} />
            <Panel>
              <Facts items={[
                ['Order', w.order_no],
                ['Machine', w.machine_code || 'Not scheduled'],
                w.planned_start && ['Planned start', date(w.planned_start)],
                ['Target', `${quantity(w.target_qty)} ${w.uom}`],
                ['Produced', `${quantity(w.produced_qty)} ${w.uom}`],
              ]} />
              <Progress pct={w.pct} caption={`${Math.round(Number(w.pct) || 0)}% of target`} />
            </Panel>
            {w.machine_id
              ? <WorkOrderActions id={w.id} uom={w.uom} status={w.status} />
              : w.status === 'planned' ? <Panel><Facts items={[['Next step', 'Choose a machine on the web app']]} /></Panel> : null}
          </>
        )}
      </QueryState>
    </Screen>
  );
}
