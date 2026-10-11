import React, { useEffect, useState } from 'react';
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper';
import { palette } from '../theme/theme';

/**
 * A small form in a dialog (works on iOS and Android, unlike Alert.prompt).
 * fields: [{ key, label, number?, required?, multiline? }]. Numbers arrive as numbers, empty optional fields are left out.
 */
export default function FormDialog({ visible, title, fields, submitLabel = 'Save', loading = false, onSubmit, onDismiss }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => { if (visible) { setValues({}); setError(null); } }, [visible]);

  const submit = () => {
    const out = {};
    for (const f of fields) {
      const raw = (values[f.key] ?? '').trim();
      if (!raw) {
        if (f.required) { setError(`Enter ${f.label.toLowerCase()}.`); return; }
        continue;
      }
      if (f.number) {
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n < (f.min ?? 0)) { setError(`${f.label}: enter a valid number.`); return; }
        out[f.key] = n;
      } else out[f.key] = raw;
    }
    setError(null);
    onSubmit(out);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={loading ? undefined : onDismiss} style={{ backgroundColor: '#fff' }}>
        <Dialog.Title style={{ color: palette.forest }}>{title}</Dialog.Title>
        <Dialog.Content>
          {fields.map((f, i) => (
            <TextInput
              key={f.key}
              label={f.label + (f.required ? '' : ' (optional)')}
              mode="outlined"
              value={values[f.key] ?? ''}
              onChangeText={t => setValues(v => ({ ...v, [f.key]: t }))}
              keyboardType={f.number ? 'decimal-pad' : 'default'}
              multiline={f.multiline}
              autoFocus={i === 0}
              disabled={loading}
              outlineColor={palette.linen}
              activeOutlineColor={palette.forest}
              style={{ marginBottom: 8, backgroundColor: '#fff' }}
            />
          ))}
          {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading} textColor={palette.textSecondary}>Cancel</Button>
          <Button onPress={submit} loading={loading} disabled={loading} mode="contained" buttonColor={palette.forest}>{submitLabel}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
