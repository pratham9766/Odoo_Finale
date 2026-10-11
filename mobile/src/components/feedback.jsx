import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { palette, radius, space } from '../theme/theme';
import { AppText, ActionButton } from './forms';

const TONES = {
  ok: { fg: palette.ok, bg: palette.okBg, icon: 'check-circle-outline' },
  info: { fg: palette.info, bg: palette.infoBg, icon: 'information-outline' },
  risk: { fg: palette.risk, bg: palette.riskBg, icon: 'alert-outline' },
  bad: { fg: palette.danger, bg: palette.dangerBg, icon: 'alert-circle-outline' },
  muted: { fg: palette.muted, bg: palette.mutedBg, icon: 'circle-outline' },
};
export const toneStyle = (tone) => TONES[tone] || TONES.info;

/**
 * A message inside a screen. Always an icon AND words (never colour alone). `action` is a { label, onPress } button.
 * Use tone "bad" for errors, "risk" for warnings that need attention, "info" for neutral news, "ok" only once the server has confirmed.
 */
export function Banner({ tone = 'info', title, text, action, secondaryAction, style, children }) {
  const t = toneStyle(tone);
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }, style]} accessibilityRole="alert" accessibilityLiveRegion={tone === 'bad' ? 'assertive' : 'polite'}>
      <MaterialCommunityIcons name={t.icon} size={24} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {title ? <AppText variant="bodyStrong" style={{ color: t.fg }}>{title}</AppText> : null}
        {text ? <AppText variant="small" style={{ color: palette.ink, marginTop: title ? 2 : 0 }}>{text}</AppText> : null}
        {children}
        {(action || secondaryAction) ? (
          <View style={styles.bannerActions}>
            {action ? <ActionButton compact kind="secondary" label={action.label} icon={action.icon} loading={action.loading} onPress={action.onPress} /> : null}
            {secondaryAction ? <ActionButton compact kind="text" label={secondaryAction.label} onPress={secondaryAction.onPress} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---- toast: a short confirmation AFTER the server has accepted something -------------------------------------------

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const show = useCallback((text, tone = 'ok') => {
    clearTimeout(timer.current);
    setMessage({ text, tone });
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    timer.current = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMessage(null)), 3500);
  }, [opacity]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity, backgroundColor: toneStyle(message.tone).fg }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <MaterialCommunityIcons name={toneStyle(message.tone).icon} size={20} color="#fff" />
          <AppText variant="bodyStrong" style={{ color: '#fff', flexShrink: 1 }}>{message.text}</AppText>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

// ---- connectivity ---------------------------------------------------------------------------------------------------

/**
 * Shown while the most recent server request failed because the phone could not reach it, and hidden again after the next
 * success. It reflects what the app actually observed, not a guess about the network.
 */
export function ConnectivityBanner() {
  const cache = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(() => cache.getQueryCache().subscribe((event) => {
    const q = event?.query;
    if (!q) return;
    if (q.state.status === 'error' && q.state.error?.code === 'NETWORK') setOffline(true);
    else if (q.state.status === 'success' && event.type === 'updated') setOffline(false);
  }), [cache]);
  if (!offline) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="wifi-off" size={18} color="#fff" />
      <AppText variant="small" style={{ color: '#fff', flex: 1 }}>Cannot reach the server. Showing the last data received. Entries will not be sent until it is back.</AppText>
    </View>
  );
}

/** "Updated 10:42" with a refresh action: tells the person how old the numbers are. */
export function Freshness({ updatedAt, refreshing, onRefresh }) {
  if (!updatedAt) return null;
  const when = new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return (
    <Pressable onPress={onRefresh} disabled={!onRefresh || refreshing} accessibilityRole="button" accessibilityLabel={`Data updated at ${when}. Refresh`} style={styles.fresh} hitSlop={8}>
      <MaterialCommunityIcons name="refresh" size={16} color={palette.textSecondary} />
      <AppText variant="caption" style={{ color: palette.textSecondary }}>{refreshing ? 'Refreshing…' : `Updated ${when}`}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: space.md, padding: space.md + 2, borderRadius: radius.md, marginBottom: space.md },
  bannerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  toast: { position: 'absolute', left: space.lg, right: space.lg, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md + 2, borderRadius: radius.md, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: palette.danger, paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  fresh: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, alignSelf: 'flex-end' },
});
