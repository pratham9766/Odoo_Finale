import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Avatar, PageTitle, Panel, QueryState, Screen, Section } from '../../../src/components/ui';
import { supabase } from '../../../src/lib/supabase';
import { palette, space } from '../../../src/theme/theme';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;   // server/src/modules/auth/me.schema.js
const field = { mode: 'outlined', style: { backgroundColor: '#fff', marginBottom: space.md }, outlineColor: palette.linen, activeOutlineColor: palette.forest };

export default function Profile() {
  const session = useSession();
  const act = useAction();
  const me = useGet('/me');
  const p = me.payload;
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', city: '', emergency_contact: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => { if (p) setForm({ full_name: p.full_name || '', phone: p.phone || '', address: p.address || '', city: p.city || '', emergency_contact: p.emergency_contact || '' }); }, [p]);
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    const e = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your name';
    if (!PHONE.test(form.phone.trim())) e.phone = 'Enter a valid phone number';
    if (form.address.trim().length < 3) e.address = 'Enter your address';
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = { full_name: form.full_name.trim(), phone: form.phone.trim(), address: form.address.trim(), ...(form.city.trim() && { city: form.city.trim() }), ...(form.emergency_contact.trim() && { emergency_contact: form.emergency_contact.trim() }) };
    act.mutate({ method: 'PUT', path: '/me/profile', body }, { onSuccess: () => { session.refreshAccess(); Alert.alert('Profile saved'); } });
  };

  return (
    <Screen onRefresh={me.refetch} refreshing={me.isRefetching}>
      <PageTitle eyebrow="ACCOUNT" title="My profile" description={`${session.context.mill.name} · ${session.context.role.name}`} />
      <QueryState query={me}>
        {p && (
          <>
            <Panel style={styles.id}>
              <Avatar name={p.full_name || p.email} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.full_name || 'No name yet'}</Text>
                <Text style={styles.email}>{p.email}</Text>
              </View>
            </Panel>

            <Section title="Details">
              <TextInput {...field} label="Full name" value={form.full_name} onChangeText={set('full_name')} error={!!errors.full_name} />
              {errors.full_name ? <HelperText type="error" visible>{errors.full_name}</HelperText> : null}
              <TextInput {...field} label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={!!errors.phone} />
              {errors.phone ? <HelperText type="error" visible>{errors.phone}</HelperText> : null}
              <TextInput {...field} label="Address" value={form.address} onChangeText={set('address')} multiline error={!!errors.address} />
              {errors.address ? <HelperText type="error" visible>{errors.address}</HelperText> : null}
              <TextInput {...field} label="City (optional)" value={form.city} onChangeText={set('city')} />
              <TextInput {...field} label="Emergency contact, name and phone (optional)" value={form.emergency_contact} onChangeText={set('emergency_contact')} />
              <Button mode="contained" onPress={save} loading={act.isPending} disabled={act.isPending} contentStyle={{ height: 48 }}>Save profile</Button>
            </Section>

            <Password />

            <Button mode="outlined" icon="logout" onPress={() => session.signOut().catch(err => Alert.alert('Sign out failed', err.message))} textColor={palette.danger} style={{ marginTop: space.lg }}>Sign out</Button>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function Password() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const change = async () => {
    if (password.length < 8) return setError('At least 8 characters');
    if (!/[A-Za-z]/.test(password)) return setError('Include a letter');
    if (!/[0-9]/.test(password)) return setError('Include a number');
    setError(null); setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    setPassword('');
    Alert.alert('Password changed');
  };

  return (
    <Section title="Change password">
      <TextInput {...field} label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      {error ? <HelperText type="error" visible>{error}</HelperText> : null}
      <Button mode="outlined" onPress={change} loading={busy} disabled={busy || !password}>Change password</Button>
    </Section>
  );
}

const styles = StyleSheet.create({
  id: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 18, fontWeight: '700', color: palette.forest },
  email: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
});
