import React, { useEffect, useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { palette, space } from '../theme/theme';

/** Full-screen QR scanner. Calls onScan(value) once per code, then stays open so a stack of rolls can be scanned in a row. */
/** `message` ({ ok, text }) shows the result of the last scan over the camera. */
export default function ScanModal({ visible, title = 'Scan a roll label', message, onScan, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef({ value: null, at: 0 });

  useEffect(() => { if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission(); }, [visible, permission, requestPermission]);

  const handle = ({ data }) => {
    const now = Date.now();
    if (!data || (last.current.value === data && now - last.current.at < 2500)) return;   // the camera reports the same code many times
    last.current = { value: data, at: now };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onScan(data.trim());
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handle} />
        ) : (
          <View style={styles.denied}>
            <Text style={styles.deniedText}>Camera access is needed to scan labels.</Text>
            {permission?.canAskAgain !== false && <Button mode="contained" onPress={requestPermission} style={{ marginTop: space.md }}>Allow camera</Button>}
          </View>
        )}
        <View style={styles.top}><Text style={styles.title}>{title}</Text></View>
        <View style={styles.frame} pointerEvents="none" />
        {message ? <View style={[styles.msg, { backgroundColor: message.ok ? palette.ok : palette.danger }]}><Text style={styles.msgText}>{message.text}</Text></View> : null}
        <View style={styles.bottom}><Button mode="contained" buttonColor="#fff" textColor={palette.forest} onPress={onClose}>Done</Button></View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 56, paddingBottom: space.lg, backgroundColor: 'rgba(16,60,50,0.85)', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  frame: { position: 'absolute', top: '30%', alignSelf: 'center', width: 240, height: 240, borderRadius: 20, borderWidth: 3, borderColor: palette.goldBright },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.xl, paddingBottom: 40 },
  msg: { position: 'absolute', bottom: 120, left: space.xl, right: space.xl, padding: space.md, borderRadius: 12 },
  msgText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  deniedText: { color: '#fff', textAlign: 'center', fontSize: 16 },
});
