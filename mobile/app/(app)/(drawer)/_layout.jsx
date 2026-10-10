import React from 'react';
import { Drawer } from 'expo-router/drawer';
import DrawerContent from '../../../src/components/DrawerContent';
import NotificationBell from '../../../src/components/NotificationBell';
import { ALL_ROUTES, NAV } from '../../../src/navigation/menu';
import { palette, serif } from '../../../src/theme/theme';

const titles = Object.fromEntries(NAV.flatMap(g => g.items.map(i => [i.route, i.label])));

// Every screen is declared here; DrawerContent decides which ones the person sees, and each screen has its own <Gate>.
export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={props => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg, shadowOpacity: 0, elevation: 0, borderBottomWidth: 1, borderBottomColor: palette.linen },
        headerTintColor: palette.forest,
        headerTitleStyle: { fontFamily: serif, fontWeight: '700', color: palette.forest },
        headerRight: () => <NotificationBell />,
        drawerStyle: { width: 300 },
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Drawer.Screen name="index" options={{ headerShown: false }} />
      {ALL_ROUTES.map(name => <Drawer.Screen key={name} name={name} options={{ title: titles[name] }} />)}
    </Drawer>
  );
}
