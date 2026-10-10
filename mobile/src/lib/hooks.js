import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../context/Session';
import { qs } from '../utils/format';

/**
 * GET a path. Returns the react-query result plus `payload` (the response's `data`) and `meta`.
 * The key starts with the user id, so signing in as someone else never shows the previous user's data.
 */
export function useGet(path, params, { enabled = true, refetchInterval } = {}) {
  const session = useSession();
  const url = `${path}${qs(params)}`;
  const query = useQuery({
    queryKey: [session.userId, url],
    queryFn: ({ signal }) => session.api(url, { signal }),
    enabled,
    refetchInterval,
  });
  return { ...query, payload: query.data?.data, meta: query.data?.meta };
}

/**
 * One mutation for any write: act.mutate({ method: 'POST', path: '/orders/1/confirm', body }, { onSuccess }).
 * `quiet: true` skips the error alert, for callers that show the message themselves (the scanner).
 * Every cached read of this user is refreshed afterwards, and a failure shows the server's message.
 */
export function useAction() {
  const session = useSession();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ method = 'POST', path, body }) => session.api(path, { method, body }),
    onSuccess: () => cache.invalidateQueries({ queryKey: [session.userId] }),
    onError: (error, vars) => { if (!vars.quiet) Alert.alert('Could not save', error.message); },
  });
}
