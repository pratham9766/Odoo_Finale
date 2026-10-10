import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Searchbar } from 'react-native-paper';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { Chips, Empty, ListRow, Panel, Pill, QueryState } from '../../../src/components/ui';
import { date, label, quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

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

function Materials() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState();
  const stock = useGet('/stock', { limit: 100, q: q || undefined, kind });
  const rows = stock.payload || [];
  const low = rows.filter(r => r.is_low).length;

  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.item_id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={stock.isRefetching} onRefresh={stock.refetch} colors={[palette.forest]} />}
      ListHeaderComponent={(
        <View>
          <Searchbar placeholder="Search material" value={text} onChangeText={setText} onSubmitEditing={() => setQ(text.trim())}
            onClearIconPress={() => setQ('')} style={styles.search} inputStyle={{ fontSize: 15 }} elevation={0} />
          <Chips options={[{ value: undefined, label: 'All kinds' }, ...KINDS.map(k => ({ value: k, label: label(k) }))]} value={kind} onChange={setKind} />
          {low > 0 && <Panel style={styles.warn}><Text style={styles.warnText}>{low} material{low > 1 ? 's' : ''} below reorder level on this page.</Text></Panel>}
        </View>
      )}
      ListEmptyComponent={<QueryState query={stock}><Empty icon="package-variant" text="No stock yet. Post a goods receipt to add material." /></QueryState>}
      renderItem={({ item: r }) => (
        <ListRow
          title={r.name}
          subtitle={r.colour || undefined}
          meta={`On hand ${quantity(r.on_hand)} · Reserved ${quantity(r.reserved)} · Reorder at ${quantity(r.reorder_level)}`}
          right={<><Text style={styles.avail}>{quantity(r.available)}</Text><Text style={styles.uom}>{r.uom} free</Text>{r.is_low ? <Pill value="red" text="Low" /> : null}</>}
        />
      )}
    />
  );
}

function Finished() {
  const finished = useGet('/stock/finished');
  const rows = finished.payload || [];
  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.roll_id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={finished.isRefetching} onRefresh={finished.refetch} colors={[palette.forest]} />}
      ListEmptyComponent={<QueryState query={finished}><Empty icon="package-variant" text="No finished rolls waiting for dispatch." /></QueryState>}
      renderItem={({ item: r }) => (
        <ListRow
          icon="roll-of-paper"
          title={r.roll_no}
          subtitle={`${r.item_name}${r.colour ? ` · ${r.colour}` : ''}`}
          meta={`${r.order_no} · made ${date(r.created_at)}`}
          right={<><Text style={styles.avail}>{quantity(r.length_m)}</Text><Text style={styles.uom}>m · {r.days_on_shelf}d on shelf</Text></>}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  tabs: { paddingHorizontal: space.lg, paddingTop: space.md },
  list: { padding: space.lg, paddingTop: 0, paddingBottom: 40 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: palette.linen, marginBottom: space.md, borderRadius: 12 },
  warn: { backgroundColor: palette.riskBg, borderColor: palette.riskBg, paddingVertical: space.md },
  warnText: { color: palette.risk, fontWeight: '600', fontSize: 13 },
  avail: { fontSize: 18, fontWeight: '700', color: palette.forest },
  uom: { fontSize: 11, color: palette.textMuted },
});
