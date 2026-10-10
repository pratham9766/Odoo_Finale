import { Slot } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme } from '../src/theme/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SessionProvider } from '../src/context/Session';
import { PreviewSessionProvider } from '../src/preview/PreviewSession';

const queryClient = new QueryClient();
const isPreview = process.env.EXPO_PUBLIC_PREVIEW === '1';

export default function RootLayout() {
  const Provider = isPreview ? PreviewSessionProvider : SessionProvider;
  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider 
        theme={theme}
        settings={{ icon: props => <MaterialCommunityIcons {...props} /> }}
      >
        <SafeAreaProvider>
          <Provider>
            <Slot />
          </Provider>
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}
