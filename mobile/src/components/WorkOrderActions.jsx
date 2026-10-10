import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSession } from '../context/Session';
import { useAction } from '../lib/hooks';
import { palette, space } from '../theme/theme';
import FormDialog from './FormDialog';

/**
 * The floor actions on one work order: start, pause, resume, log output, finish, add a roll (the web's WorkOrderActions).
 * `status` is the work order's status: planned | running | paused.
 */
export default function WorkOrderActions({ id, status, uom, compact = false }) {
  const { can } = useSession();
  const act = useAction();
  const [dialog, setDialog] = useState(null);   // 'log' | 'pause' | 'finish' | 'roll'
  if (!can('production.log') || !id) return null;

  const close = () => setDialog(null);
  const post = (path, body) => act.mutate({ path: `/work-orders/${id}/${path}`, body }, { onSuccess: close });
  const mode = compact ? 'contained-tonal' : 'contained';

  const DIALOGS = {
    log: { title: 'Log output', label: 'Log', fields: [{ key: 'qty', label: `Output since the last entry (${uom || 'units'})`, number: true, required: true }], send: v => post('logs', { qty: v.qty }) },
    pause: { title: 'Pause work order', label: 'Pause', fields: [{ key: 'reason', label: 'Reason' }], send: v => post('pause', v.reason ? { reason: v.reason } : {}) },
    finish: { title: 'Finish work order', label: 'Finish', fields: [
      { key: 'good_qty', label: `Good output (${uom || 'units'})`, number: true, required: true },
      { key: 'waste_qty', label: 'Waste', number: true },
    ], send: v => post('finish', { good_qty: v.good_qty, waste_qty: v.waste_qty ?? 0 }) },
    roll: { title: 'Add a roll', label: 'Add roll', fields: [
      { key: 'length_m', label: 'Length (m)', number: true, required: true, min: 0.1 },
      { key: 'weight_kg', label: 'Weight (kg)', number: true, min: 0.1 },
    ], send: v => act.mutate({ path: '/rolls', body: { work_order_id: id, ...v } }, { onSuccess: close }) },
  };
  const d = dialog && DIALOGS[dialog];

  return (
    <View style={styles.row}>
      {status === 'planned' && <Button mode={mode} compact={compact} loading={act.isPending} onPress={() => post('start')}>Start</Button>}
      {status === 'paused' && <Button mode={mode} compact={compact} loading={act.isPending} onPress={() => post('resume')}>Resume</Button>}
      {status === 'running' && <Button mode={mode} compact={compact} onPress={() => setDialog('log')}>Log output</Button>}
      {status === 'running' && <Button mode="outlined" compact={compact} onPress={() => setDialog('roll')}>Add roll</Button>}
      {status === 'running' && <Button mode="outlined" compact={compact} onPress={() => setDialog('pause')}>Pause</Button>}
      {(status === 'running' || status === 'paused') && <Button mode="outlined" compact={compact} textColor={palette.danger} onPress={() => setDialog('finish')}>Finish</Button>}
      <FormDialog visible={!!d} title={d?.title} fields={d?.fields || []} submitLabel={d?.label} loading={act.isPending} onSubmit={d?.send} onDismiss={close} />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md } });
