import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Empty, ListRow, PageTitle, Panel, Pill, QueryState, Screen, Section } from '../../../src/components/ui';
import { palette, space } from '../../../src/theme/theme';

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

  const create = () => {
    const body = { order_id: orderId, ...(vehicle.trim() && { vehicle_no: vehicle.trim() }), ...(driver.trim() && { driver_name: driver.trim() }), ...(phone.trim() && { driver_phone: phone.trim() }) };
    act.mutate({ path: '/dispatches', body }, { onSuccess: res => router.replace(`/(app)/dispatch/${res.data.id}`) });
  };
  const field = { mode: 'outlined', style: { backgroundColor: '#fff', marginBottom: space.md }, outlineColor: palette.linen, activeOutlineColor: palette.forest };

  return (
    <Screen>
      <PageTitle eyebrow="DISPATCH" title="New dispatch" description="Pick the order that is going out. You will scan the rolls on the next screen." />
      <Section title="Order">
        <QueryState query={orders}>
          {(orders.payload || []).length === 0 ? <Panel><Empty text="No orders are ready to send." /></Panel> : orders.payload.map(o => (
            <View key={o.id} style={orderId === o.id && styles.picked}>
              <ListRow title={o.order_no} subtitle={o.buyer_name} right={<Pill value={o.status} />} onPress={() => setOrderId(o.id)} />
            </View>
          ))}
        </QueryState>
      </Section>
      <Section title="Truck (optional)">
        <TextInput {...field} label="Vehicle number" value={vehicle} onChangeText={setVehicle} autoCapitalize="characters" />
        <TextInput {...field} label="Driver name" value={driver} onChangeText={setDriver} />
        <TextInput {...field} label="Driver phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </Section>
      <Button mode="contained" onPress={create} disabled={!orderId || act.isPending} loading={act.isPending} contentStyle={{ height: 50 }}>Create dispatch</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picked: { borderRadius: 14, borderWidth: 2, borderColor: palette.gold, marginBottom: space.sm, overflow: 'hidden' },
});
