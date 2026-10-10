import React from 'react';
import { Stack } from 'expo-router';
import { useSession } from '../../src/context/Session';
import { palette, serif } from '../../src/theme/theme';

// The drawer holds the main screens; details open on top of it with a back button.
const detail = title => ({ headerShown: true, title });

export default function AppLayout() {
  // Signed out, the router can reach this group for a moment before the login redirect; nothing here works without a session.
  if (!useSession()) return null;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.forest,
        headerTitleStyle: { fontFamily: serif, fontWeight: '700', color: palette.forest },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen name="(drawer)" />
      <Stack.Screen name="orders/[id]" options={detail('Order')} />
      <Stack.Screen name="receipts/[id]" options={detail('Goods receipt')} />
      <Stack.Screen name="work-order/[id]" options={detail('Work order')} />
      <Stack.Screen name="qc/inspect" options={detail('Inspect roll')} />
      <Stack.Screen name="dispatch/new" options={detail('New dispatch')} />
      <Stack.Screen name="dispatch/[id]" options={detail('Dispatch')} />
    </Stack>
  );
}
