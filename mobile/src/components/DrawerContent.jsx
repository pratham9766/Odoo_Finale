import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_FONT_SCALE } from '../theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '../context/Session';
import { visibleNav } from '../navigation/menu';
import { palette, space } from '../theme/theme';
import { Avatar } from './ui';
import Logo from './Logo';

/** The sidebar, as a drawer: brand, mill name, the permission-filtered menu, and the signed-in person with Sign out. */
export default function DrawerContent({ state, navigation }) {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = state.routes[state.index]?.name;
  const groups = visibleNav(session.can);
  const user = session.context.user;
  const name = user?.full_name || user?.email || session.context.role.name;

  const go = route => { navigation.closeDrawer(); router.navigate(`/(app)/(drawer)/${route}`); };
  const signOut = () => Alert.alert('Sign out?', 'Entries that are not confirmed yet stay on this phone for your next sign-in.', [
    { text: 'Stay signed in', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => {
      setBusy(true);
      try { await session.signOut(); } catch (err) { Alert.alert('Sign out failed', err.message); setBusy(false); }
    } },
  ]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.brand}>
        <Logo size={32} />
        <Text style={styles.brandText}>sameta</Text>
      </View>
      <View style={styles.mill}>
        <MaterialCommunityIcons name="factory" size={15} color={palette.sage} />
        <Text style={styles.millText} numberOfLines={1}>{session.context.mill?.name}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {groups.map((g, i) => (
          <View key={g.caption || i} style={{ marginTop: space.md }}>
            {g.caption ? <Text style={styles.caption}>{g.caption}</Text> : null}
            {g.items.map(item => {
              const on = active === item.route;
              return (
                <Pressable key={item.route} onPress={() => go(item.route)} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: on }} style={[styles.item, on && styles.itemOn]}>
                  <MaterialCommunityIcons name={item.icon} size={21} color={on ? palette.goldBright : palette.sage} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.itemText, on && styles.itemTextOn]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={styles.web}>Finance, wages, reports, staff and settings are on the web app.</Text>
      </ScrollView>

      <View style={styles.user}>
        <Avatar name={name} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>{name}</Text>
          <Text style={styles.userRole} numberOfLines={1}>{session.context.role.name}</Text>
        </View>
        <Pressable onPress={signOut} disabled={busy} accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOut}>
          <MaterialCommunityIcons name="logout" size={22} color={palette.goldBright} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.signOutText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.forest, paddingHorizontal: space.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  brandText: { fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  mill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, marginHorizontal: space.sm, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  millText: { color: palette.cream, fontSize: 13, fontWeight: '600', flex: 1 },
  caption: { fontSize: 12, letterSpacing: 1.2, fontWeight: '700', color: palette.sage, paddingHorizontal: space.sm, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: 8, paddingHorizontal: space.md, borderRadius: 10 },
  itemOn: { backgroundColor: 'rgba(255,255,255,0.1)' },
  itemText: { color: palette.cream, fontSize: 15, fontWeight: '500' },
  itemTextOn: { color: '#fff', fontWeight: '700' },
  web: { color: palette.sage, fontSize: 12, lineHeight: 17, margin: space.md },
  user: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  userName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  userRole: { color: palette.sage, fontSize: 13 },
  signOut: { minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm },
  signOutText: { color: palette.goldBright, fontSize: 14, fontWeight: '700' },
});
