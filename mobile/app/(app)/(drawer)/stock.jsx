import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { AppText, Banner, Chips, Empty, Panel, QueryState, SearchBar, StatusBadge, useLayout } from '../../../src/components/ui';
import { date, label, quantity } from '../../../src/utils/format';
import { CONTENT_MAX, palette, space } from '../../../src/theme/theme';

const KINDS = ['fibre', 'yarn', 'grey_fabric', 'finished_fabric', 'dye', 'chemical', 'packing', 'scrap'];
const TABS = [{ value: 'materials', label: 'Materials' }, { value: 'finished', label: 'Finished rolls' }];

export default function Stock() {
  return <Gate perms="stock.view"><Body /></Gate>;
}

function Body() {
  const [tab, setTab] = useState('materials');
  return (
    <View style={styles.root}>
      <View style={styles.tabs}><Chips options={TABS} value={tab} onChange={setTab} /></View>
      {tab === 'materials' ? <Materials /> : <Finished />}
    </View>
  );
}

/** One figure with its label and unit, so on-hand, reserved and available cannot be confused. */
function Figure({ name, value, uom, strong, tone }) {
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${name}: ${quantity(value)} ${uom}`}>
      <AppText variant="caption">{name}</AppText>
      <AppText variant={strong ? 'h2' : 'bodyStrong'} style={tone ? { color: tone } : undefined}>{quantity(value)}</AppText>
      <AppText variant="caption">{uom}</AppText>
    </View>
  );
}

function Materials() {
  const { tablet } = useLayout();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState();
  const stock = useGet('/stock', { limit: 100, q: q || undefined, kind });
  const rows = stock.payload || [];
  const low = rows.filter((r) => r.is_low).length;

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.item_id}
      contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' }]}
      refreshControl={<RefreshControl refreshing={stock.isRefetching} onRefresh={stock.refetch} colors={[palette.forest]} />}
      ListHeaderComponent={(
        <View>
          <SearchBar placeholder="Search material" value={text} onChangeText={setText} onSubmit={setQ} />
          <Chips options={[{ value: undefined, label: 'All kinds' }, ...KINDS.map((k) => ({ value: k, label: label(k) }))]} value={kind} onChange={setKind} />
          {low > 0 && <Banner tone="risk" title={`${low} material${low > 1 ? 's' : ''} below reorder level`} text="Free stock (on hand minus what is reserved for orders) is at or under the level set for that material. Order more before production waits." />}
        </View>
      )}
      ListEmptyComponent={stock.isError || stock.isPending
        ? <QueryState query={stock}><View /></QueryState>
        : <Empty icon="package-variant" text={q || kind ? 'No material matches.' : 'No stock yet.'} hint={q || kind ? 'Clear the search or choose "All kinds".' : 'Material appears here once a goods receipt is posted.'} />}
      renderItem={({ item: r }) => (
        <Panel accessibilityLabel={`${r.name}. On hand ${quantity(r.on_hand)} ${r.uom}, reserved ${quantity(r.reserved)}, free ${quantity(r.available)}${r.is_low ? '. Low' : ''}`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{r.name}</AppText>
              {r.colour ? <AppText variant="small">{r.colour}</AppText> : null}
            </View>
            {r.is_low ? <StatusBadge tone="bad" text="Low stock" icon="package-down" /> : null}
          </View>
          <View style={styles.figures}>
            <Figure name="On hand" value={r.on_hand} uom={r.uom} />
            <Figure name="Reserved" value={r.reserved} uom={r.uom} />
            <Figure name="Free" value={r.available} uom={r.uom} strong tone={r.is_low ? palette.danger : palette.forest} />
          </View>
          <AppText variant="caption">Reorder level: {quantity(r.reorder_level)} {r.uom}</AppText>
        </Panel>
      )}
    />
  );
}

function Finished() {
  const { tablet } = useLayout();
  const finished = useGet('/stock/finished');
  const rows = finished.payload || [];
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.roll_id}
      contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' }]}
      refreshControl={<RefreshControl refreshing={finished.isRefetching} onRefresh={finished.refetch} colors={[palette.forest]} />}
      ListHeaderComponent={<AppText variant="small" style={{ marginBottom: space.md }}>Rolls that passed quality control and have not been dispatched yet.</AppText>}
      ListEmptyComponent={finished.isError || finished.isPending
        ? <QueryState query={finished}><View /></QueryState>
        : <Empty icon="package-variant" text="No finished rolls are waiting for dispatch." />}
      renderItem={({ item: r }) => (
        <Panel accessibilityLabel={`${r.roll_no}, ${quantity(r.length_m)} metres, ${r.days_on_shelf} days on the shelf`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{r.roll_no}</AppText>
              <AppText variant="small">{r.item_name}{r.colour ? ` · ${r.colour}` : ''}</AppText>
              <AppText variant="caption">{r.order_no} · made {date(r.created_at)}</AppText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="h2">{quantity(r.length_m)}</AppText>
              <AppText variant="caption">metres</AppText>
              <AppText variant="caption" style={r.days_on_shelf >= 7 ? { color: palette.risk, fontWeight: '700' } : undefined}>{r.days_on_shelf} days on shelf</AppText>
            </View>
          </View>
        </Panel>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  tabs: { paddingHorizontal: space.lg, paddingTop: space.md },
  list: { padding: space.lg, paddingTop: 0, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  figures: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
  figure: { flex: 1, backgroundColor: palette.bg, borderRadius: 10, padding: space.sm + 2, alignItems: 'flex-start' },
});
