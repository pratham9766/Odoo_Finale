import React, { useEffect, useRef } from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { palette, space } from '../theme/theme';
import { ActionButton, AppText } from './forms';

const DUPLICATE_WINDOW_MS = 2500;

/**
 * Full-screen scanner for roll labels (QR) and Code 128 / Code 39 / EAN-13 barcodes.
 *
 *  - The camera only exists while this screen is visible, so it is released when it closes (and on Android back).
 *  - The camera reports the same code many times a second: a repeat of the same value within 2.5 s is ignored.
 *  - onScan(value) is called once per code and the scanner STAYS OPEN, so a stack of rolls can be scanned in a row.
 *    `message` ({ ok, text }) shows what happened to the last scan over the camera.
 *  - If camera access is refused the person is told how to allow it, and that typing the roll number on the previous screen works too.
 */
export default function ScanModal({ visible, title = 'Scan a roll label', message, onScan, onClose }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef({ value: null, at: 0 });

  useEffect(() => { if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission(); }, [visible, permission, requestPermission]);
  useEffect(() => { if (!visible) last.current = { value: null, at: 0 }; }, [visible]);

  const handle = ({ data }) => {
    const value = typeof data === 'string' ? data.trim() : '';
    const now = Date.now();
    if (!value || (last.current.value === value && now - last.current.at < DUPLICATE_WINDOW_MS)) return;
    last.current = { value, at: now };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onScan(value);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }} onBarcodeScanned={handle} />
        ) : (
          <View style={styles.denied}>
            <MaterialCommunityIcons name="camera-off-outline" size={48} color="#fff" />
            <AppText variant="h2" style={{ color: '#fff', textAlign: 'center' }}>{permission ? 'Camera access is off' : 'Starting the camera…'}</AppText>
            <AppText variant="body" style={{ color: '#fff', textAlign: 'center' }}>
              {permission?.canAskAgain === false
                ? 'Allow the camera for SAMETA in your phone settings to scan labels.'
                : 'SAMETA needs the camera to scan roll labels.'} You can also close this and type the roll number instead.
            </AppText>
            {permission && permission.canAskAgain !== false ? <ActionButton label="Allow camera" icon="camera" onPress={requestPermission} /> : null}
            {permission && permission.canAskAgain === false ? <ActionButton label="Open phone settings" icon="cog-outline" onPress={() => Linking.openSettings()} /> : null}
          </View>
        )}
        <View style={[styles.top, { paddingTop: insets.top + space.md }]}>
          <AppText variant="h3" style={styles.title} accessibilityRole="header">{title}</AppText>
          <AppText variant="small" style={styles.hint}>Hold the label inside the frame</AppText>
        </View>
        {permission?.granted ? <View style={styles.frame} pointerEvents="none" /> : null}
        {message ? (
          <View style={[styles.msg, { backgroundColor: message.ok ? palette.ok : palette.danger, bottom: insets.bottom + 110 }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <MaterialCommunityIcons name={message.ok ? 'check-circle' : 'alert-circle'} size={22} color="#fff" />
            <AppText variant="bodyStrong" style={styles.msgText}>{message.text}</AppText>
          </View>
        ) : null}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
          <ActionButton label="Done" kind="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: space.lg, backgroundColor: 'rgba(16,60,50,0.88)', alignItems: 'center', gap: 2 },
  title: { color: '#fff' },
  hint: { color: 'rgba(255,255,255,0.85)' },
  frame: { position: 'absolute', top: '30%', alignSelf: 'center', width: 250, height: 250, borderRadius: 20, borderWidth: 3, borderColor: palette.goldBright },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.xl },
  msg: { position: 'absolute', left: space.lg, right: space.lg, padding: space.md, borderRadius: 12, flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  msgText: { color: '#fff', flex: 1 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
});
