import { QueryClient } from '@tanstack/react-query';
import { message } from 'antd';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (count, err) => {
        // Only retry on server errors, not client errors
        if (err?.status >= 400 && err?.status < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (err) => {
        // Show global error toast only if not already handled inline
        if (!err._handled) {
          message.error(err.message || 'Something went wrong');
        }
      },
    },
  },
});
