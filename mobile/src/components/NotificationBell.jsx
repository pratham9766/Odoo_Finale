import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGet } from '../lib/hooks';
import { palette } from '../theme/theme';

/** The bell in the header: unread count from /notifications, tap to open the list. Refreshes every two minutes, like the web. */
export default function NotificationBell() {
  const router = useRouter();
  const list = useGet('/notifications', { limit: 1 }, { refetchInterval: 120000 });
  const unread = list.meta?.unread ?? 0;
  return (
    <Pressable onPress={() => router.navigate('/(app)/(drawer)/notifications')} hitSlop={10} style={styles.btn} accessibilityLabel="Notifications">
      <MaterialCommunityIcons name="bell-outline" size={24} color={palette.forest} />
      {unread > 0 && (
        <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { marginRight: 16 },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
