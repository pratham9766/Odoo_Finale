import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPointsAtThisDevice } from '../config';
import { palette, radius, space } from '../theme/theme';
import { AppText } from './forms';

/** Shown instead of the app when the build has no server or Supabase settings. Names only, never values. */
export default function SetupRequired({ missing }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={[styles.box, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <MaterialCommunityIcons name="cog-outline" size={48} color={palette.forest} />
      <AppText variant="h1" accessibilityRole="header" style={{ textAlign: 'center' }}>SAMETA is not set up yet</AppText>
      <AppText variant="body" style={{ textAlign: 'center' }}>This build is missing settings it needs to reach the server and sign you in. Add them to <AppText variant="bodyStrong">mobile/.env</AppText> and restart Expo.</AppText>
      <View style={styles.list} accessibilityLabel={`Missing settings: ${missing.join(', ')}`}>
        {missing.map((name) => <AppText key={name} variant="bodyStrong" style={styles.code}>{name}</AppText>)}
      </View>
      <AppText variant="small" style={{ textAlign: 'center' }}>See mobile/.env.example. On a real phone the server address must be your computer's address on the same Wi-Fi, not localhost.</AppText>
      {apiPointsAtThisDevice() ? <AppText variant="small" style={{ color: palette.danger, textAlign: 'center' }}>The server address points at this phone itself (localhost). Use your computer's network address.</AppText> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: space.lg, paddingHorizontal: space.xl },
  list: { alignSelf: 'stretch', backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.linen, padding: space.lg, gap: space.sm },
  code: { fontFamily: 'monospace', color: palette.danger },
});
