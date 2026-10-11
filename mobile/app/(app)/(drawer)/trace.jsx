import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import ScanModal from '../../../src/components/ScanModal';
import { ActionButton, AppText, Field, PageTitle, Panel, Screen } from '../../../src/components/ui';
import { space } from '../../../src/theme/theme';

export default function Trace() {
  return <Gate perms="qc.view"><Body /></Gate>;
}

/** Scan a roll label (its QR carries a private roll token) or type the roll number; both open the same journey (GET /rolls/:code/trace). */
function Body() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [text, setText] = useState('');

  const open = (code) => {
    const value = String(code || '').trim();
    if (!value) return;
    setScanning(false);
    router.push(`/(app)/roll/${encodeURIComponent(value)}`);
  };

  return (
    <Screen>
      <PageTitle eyebrow="TRACEABILITY" title="Trace a roll" description="See where a roll came from, how it was made and how it checked out." />
      <ActionButton label="Scan roll label" icon="qrcode-scan" onPress={() => setScanning(true)} style={{ marginBottom: space.lg }} />
      <Panel>
        <AppText variant="h3" style={{ marginBottom: space.sm }}>Or type the roll number</AppText>
        <Field label="Roll number" value={text} onChangeText={setText} autoCapitalize="characters" placeholder="R-17-001" returnKeyType="search" onSubmitEditing={() => open(text)} helper="It is printed on the label, for example R-17-001" />
        <ActionButton kind="secondary" label="Show journey" icon="timeline-text-outline" onPress={() => open(text)} disabled={!text.trim()} />
      </Panel>
      <View style={styles.note}><AppText variant="caption">If the camera is not allowed or the label is damaged, the roll number works the same way.</AppText></View>
      <ScanModal visible={scanning} title="Scan a roll label" onScan={open} onClose={() => setScanning(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ note: { marginTop: space.md } });
