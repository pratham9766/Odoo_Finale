import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../src/theme/theme';
import { missingConfig } from '../src/config';
import { SessionProvider } from '../src/context/Session';
import { ToastProvider } from '../src/components/feedback';
import SetupRequired from '../src/components/SetupRequired';

// A failed read is retried at most twice and only when it could succeed later (no answer, server error). A 4xx is the final answer.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 2 && (!error?.status || error.status >= 500),
      staleTime: 15_000,
      refetchOnReconnect: true,
    },
  },
});

// The sample-data preview is a development tool. `__DEV__` is false in every release bundle, so Metro drops this require
// entirely: the preview code is not even present in a release build.
const PreviewProvider = __DEV__ && process.env.EXPO_PUBLIC_PREVIEW === '1' ? require('../src/preview/PreviewSession').PreviewSessionProvider : null;

export default function RootLayout() {
  const Provider = PreviewProvider || SessionProvider;
  const missing = PreviewProvider ? [] : missingConfig();
  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme} settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          {missing.length ? <SetupRequired missing={missing} /> : (
            <ToastProvider>
              <Provider>
                <Slot />
              </Provider>
            </ToastProvider>
          )}
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}
