import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useSession } from '@/context/Session';

/** ?a=1&b=2 from an object, skipping empty values */
export function qs(params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}

/**
 * GET a path. Returns the react-query result plus `payload` (the `data` of the response) and `meta`.
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
 * Every cached read of this user is refreshed afterwards, and a failure shows the server's message.
 */
export function useAction({ success } = {}) {
  const session = useSession();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ method = 'POST', path, body }) => session.api(path, { method, body }),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: [session.userId] });
      if (success) message.success(success);
    },
    onError: (e) => message.error(e.message),
  });
}

/** remove empty strings so optional fields are simply not sent */
export const clean = (values) => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined));

export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const monthISO = () => todayISO().slice(0, 7);
