import { Drawer } from 'expo-router/drawer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

export default function DrawerLayout() {
  const theme = useTheme();
  
  return (
    <Drawer screenOptions={{ 
      drawerActiveTintColor: theme.colors.primary,
      headerStyle: { backgroundColor: theme.colors.surface },
      headerTintColor: theme.colors.text,
    }}>
      <Drawer.Screen 
        name="dashboard" 
        options={{ 
          title: 'Home',
          drawerIcon: ({ color }) => <MaterialCommunityIcons name="home" size={24} color={color} />
        }} 
      />
      <Drawer.Screen 
        name="work-orders" 
        options={{ 
          title: 'Assigned Work',
          drawerIcon: ({ color }) => <MaterialCommunityIcons name="clipboard-check" size={24} color={color} />
        }} 
      />
      <Drawer.Screen 
        name="orders" 
        options={{ 
          title: 'Orders',
          drawerIcon: ({ color }) => <MaterialCommunityIcons name="clipboard-list" size={24} color={color} />
        }} 
      />
      <Drawer.Screen 
        name="machine-board" 
        options={{ 
          title: 'Machine Board',
          drawerIcon: ({ color }) => <MaterialCommunityIcons name="factory" size={24} color={color} />
        }} 
      />
      <Drawer.Screen 
        name="dispatch" 
        options={{ 
          title: 'Dispatch',
          drawerIcon: ({ color }) => <MaterialCommunityIcons name="truck-delivery" size={24} color={color} />
        }} 
      />
      <Drawer.Screen 
        name="qc-queue" 
        options={{ 
          title: 'QC Queue',
          drawerIcon: ({ color }) => <MaterialCommunityIcons name="magnify-scan" size={24} color={color} />
        }} 
      />
    </Drawer>
  );
}
