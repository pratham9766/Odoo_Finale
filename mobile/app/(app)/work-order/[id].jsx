import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import WorkOrderActions from '../../../src/components/WorkOrderActions';
import { useGet } from '../../../src/lib/hooks';
import { Banner, Facts, PageTitle, Panel, Progress, QueryState, Screen, Section, StatusBadge } from '../../../src/components/ui';
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
            {/* summary */}
            <PageTitle eyebrow={w.is_rework ? 'REWORK WORK ORDER' : 'WORK ORDER'} title={w.wo_no} description={`${w.item} · ${w.stage}`} right={<StatusBadge value={w.status} />} />
            <Panel>
              <Facts items={[
                ['Order', w.order_no],
                ['Machine', w.machine_code || 'Not scheduled'],
                w.planned_start && ['Planned start', date(w.planned_start)],
                ['Target', `${quantity(w.target_qty)} ${w.uom}`],
                ['Produced so far', `${quantity(w.produced_qty)} ${w.uom}`],
              ]} />
              <Progress pct={w.pct} caption={`${Math.round(Number(w.pct) || 0)}% of target`} />
            </Panel>

            {/* what can be done now */}
            {w.machine_id ? <WorkOrderActions wo={w} /> : (
              <Section title="Next step">
                <Banner tone="info" title="No machine yet" text={w.status === 'planned' ? 'This work order has to be given a machine on the web app before it can be started.' : 'This work order has no machine, so nothing can be logged on it from here.'} />
              </Section>
            )}
          </>
        )}
      </QueryState>
    </Screen>
  );
}
