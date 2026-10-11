import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import DrawerContent from '../../../src/components/DrawerContent';
import NotificationBell from '../../../src/components/NotificationBell';
import { ConnectivityBanner } from '../../../src/components/feedback';
import { ALL_ROUTES, NAV } from '../../../src/navigation/menu';
import { palette, serif } from '../../../src/theme/theme';

const titles = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.route, i.label])));
const PERMANENT_MENU_MIN_WIDTH = 900;

// Every screen is declared here; DrawerContent decides which ones the person sees, and each screen has its own <Gate>.
// The menu opens from the LEFT (swipe from the left edge or the menu button), closes with Android back, and stays open beside the
// content on wide screens such as a landscape tablet.
export default function DrawerLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= PERMANENT_MENU_MIN_WIDTH;
  return (
    <View style={{ flex: 1 }}>
      <ConnectivityBanner />
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          drawerPosition: 'left',
          drawerType: wide ? 'permanent' : 'front',
          swipeEdgeWidth: 40,
          overlayColor: 'rgba(16,60,50,0.45)',
          headerStyle: { backgroundColor: palette.bg, shadowOpacity: 0, elevation: 0, borderBottomWidth: 1, borderBottomColor: palette.linen },
          headerTintColor: palette.forest,
          headerTitleStyle: { fontFamily: serif, fontWeight: '700', color: palette.forest },
          headerRight: () => <NotificationBell />,
          drawerStyle: { width: wide ? 280 : 300 },
          sceneStyle: { backgroundColor: palette.bg },
        }}
      >
        <Drawer.Screen name="index" options={{ headerShown: false }} />
        {ALL_ROUTES.map((name) => <Drawer.Screen key={name} name={name} options={{ title: titles[name] }} />)}
      </Drawer>
    </View>
  );
}
