import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Empty, QueryState } from '../../../src/components/ui';
import { dateTime } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

// notification links are web paths (/app/stock, /orders/<id> ...); map them to the phone's screens
const LIST = { orders: 'orders', stock: 'stock', receipts: 'receipts', production: 'machine-board', maintenance: 'machine-board', 'work-orders': 'work-orders',
  quality: 'qc-queue', qc: 'qc-queue', dispatch: 'dispatch', attendance: 'attendance' };
const DETAIL = { orders: 'orders', receipts: 'receipts', dispatch: 'dispatch', 'work-orders': 'work-order' };

function where(link) {
  if (!link) return null;
  const [first, id] = link.replace(/^\/(app|floor)\b/, '').split('?')[0].split('/').filter(Boolean);
  if (first === 'rolls' && id) return `/(app)/roll/${encodeURIComponent(id)}`;
  if (id && DETAIL[first] && /^[0-9a-f-]{36}$/i.test(id)) return `/(app)/${DETAIL[first]}/${id}`;
  return LIST[first] ? `/(app)/(drawer)/${LIST[first]}` : null;
}

export default function Notifications() {
  const router = useRouter();
  const { userId } = useSession();
  const act = useAction();
  const list = useGet('/notifications', { limit: 50 }, { refetchInterval: 120000 });
  const rows = list.payload || [];
  const unread = list.meta?.unread ?? 0;

  const open = n => {
    if (!n.read) act.mutate({ path: `/notifications/${n.id}/read`, quiet: true });
    const to = where(n.link);
    if (to) router.push(to);
  };

  return (
    <View style={styles.root} key={userId}>
      <FlatList
        data={rows}
        keyExtractor={n => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={unread > 0 ? <Button mode="outlined" onPress={() => act.mutate({ path: '/notifications/read-all' })} loading={act.isPending} style={{ marginBottom: space.md }}>Mark all {unread} as read</Button> : null}
        ListEmptyComponent={<QueryState query={list}><Empty icon="bell-check-outline" text="No notifications" /></QueryState>}
        renderItem={({ item: n }) => (
          <Pressable onPress={() => open(n)} style={[styles.card, !n.read && styles.unread]}>
            {!n.read && <View style={styles.dot} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, !n.read && { fontWeight: '700' }]}>{n.title}</Text>
              {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
              <Text style={styles.time}>{dateTime(n.created_at)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  list: { padding: space.lg, paddingBottom: 40 },
  card: { flexDirection: 'row', gap: space.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: palette.linen, padding: space.lg, marginBottom: space.sm },
  unread: { borderColor: palette.goldBright, backgroundColor: '#FFFCF3' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.gold, marginTop: 6 },
  title: { fontSize: 15, color: palette.ink },
  body: { fontSize: 13, color: palette.textSecondary, marginTop: 3, lineHeight: 18 },
  time: { fontSize: 11, color: palette.textMuted, marginTop: 6 },
});
