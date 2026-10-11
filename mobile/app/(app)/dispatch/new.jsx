import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, Empty, Field, PageTitle, Panel, QueryState, Screen, Section, StatusBadge } from '../../../src/components/ui';
import { date } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

export default function NewDispatch() {
  return <Gate perms="dispatch.create"><Body /></Gate>;
}

function Body() {
  const router = useRouter();
  const act = useAction();
  const orders = useGet('/orders', { limit: 100, status: 'ready_to_ship,partially_dispatched,in_production,in_qc' });
  const [orderId, setOrderId] = useState(null);
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);

  const create = () => {
    setError(null);
    const body = { order_id: orderId, ...(vehicle.trim() && { vehicle_no: vehicle.trim() }), ...(driver.trim() && { driver_name: driver.trim() }), ...(phone.trim() && { driver_phone: phone.trim() }) };
    act.mutate({ path: '/dispatches', body, quiet: true }, {
      onSuccess: (res) => router.replace(`/(app)/dispatch/${res.data.id}`),
      onError: (e) => setError(describeError(e, { write: true })),
    });
  };
  const list = orders.payload || [];

  return (
    <Screen footer={<ActionButton label="Create dispatch" icon="truck-plus-outline" onPress={create} loading={act.isPending} disabled={!orderId} accessibilityHint="Opens the packing screen where you scan the rolls" />}>
      <PageTitle eyebrow="DISPATCH" title="New dispatch" description="Pick the order that is going out. You will scan the rolls on the next screen." />
      <Section title="1. Order" note={orderId ? 'Order selected.' : 'Choose one order.'}>
        <QueryState query={orders}>
          {list.length === 0 ? <Panel><Empty icon="package-variant-closed" text="No order is ready to send." hint="Orders appear here once production has started on them." /></Panel> : list.map((o) => {
            const on = orderId === o.id;
            return (
              <Pressable key={o.id} onPress={() => setOrderId(o.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${o.order_no}, ${o.buyer_name || 'no buyer'}, ${o.status}`}
                style={[styles.order, on && styles.orderOn]}>
                <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={on ? palette.forest : palette.textMuted} />
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{o.order_no}</AppText>
                  <AppText variant="small">{o.buyer_name || 'No buyer'}{o.deadline ? ` · due ${date(o.deadline)}` : ''}</AppText>
                </View>
                <StatusBadge value={o.status} />
              </Pressable>
            );
          })}
        </QueryState>
      </Section>
      <Section title="2. Truck" note="Optional. You can fill this in later on the web.">
        <Field label="Vehicle number" optional value={vehicle} onChangeText={setVehicle} autoCapitalize="characters" />
        <Field label="Driver name" optional value={driver} onChangeText={setDriver} />
        <Field label="Driver phone" optional value={phone} onChangeText={setPhone} helper="Digits only, 7 to 15 characters" />
      </Section>
      {error ? <Banner tone="bad" title={error.title} text={error.message} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  order: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: palette.linen, backgroundColor: '#fff', marginBottom: space.sm },
  orderOn: { borderColor: palette.forest, backgroundColor: palette.cream },
});
