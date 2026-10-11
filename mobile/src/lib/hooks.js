import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../context/Session';
import { describeError } from '../services/api/errors';
import { createPendingStore } from '../services/submissions/pendingStore';
import { secureStorage } from '../services/submissions/secureStorage';
import { createSubmissionEngine } from '../services/submissions/submissionEngine';
import { qs } from '../utils/format';

/**
 * GET a path. Returns the react-query result plus `payload` (the response's `data`), `meta`, and `updatedAt`
 * (when this data was last fetched successfully, for the "updated 10:42" label).
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
  return { ...query, payload: query.data?.data, meta: query.data?.meta, updatedAt: query.dataUpdatedAt || null };
}

/**
 * One mutation for any write: act.mutate({ method: 'POST', path: '/orders/1/confirm', body }, { onSuccess }).
 * `quiet: true` skips the error alert, for callers that show the message themselves (the scanner, dialogs).
 * Every cached read of this user is refreshed afterwards. Use `useSubmissions` instead for writes that must never be applied twice.
 */
export function useAction() {
  const session = useSession();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ method = 'POST', path, body }) => session.api(path, { method, body }),
    onSuccess: () => cache.invalidateQueries({ queryKey: [session.userId] }),
    onError: (error, vars) => {
      if (vars.quiet) return;
      const info = describeError(error, { write: true });
      Alert.alert(info.title, info.message);
    },
  });
}

/**
 * Writes that must never be applied twice (production output, new roll). Each logical entry is saved on the phone with its
 * idempotency key BEFORE it is sent, retried with the SAME key, and kept until the server confirms or refuses it, even across
 * an app restart. See services/submissions/submissionEngine.js for the rules. `entries` are the unresolved ones of this user.
 */
export function useSubmissions(subjectId) {
  const session = useSession();
  const cache = useQueryClient();
  const store = useMemo(() => createPendingStore(secureStorage), []);
  const engine = useMemo(() => createSubmissionEngine({ store, api: session.api, userId: session.userId }), [store, session.api, session.userId]);
  const [all, setAll] = useState([]);

  const refresh = useCallback(async () => { setAll(await engine.list()); }, [engine]);
  useEffect(() => { refresh(); }, [refresh]);

  const settle = useCallback(async (result) => {
    await refresh();
    if (result.outcome === 'saved') cache.invalidateQueries({ queryKey: [session.userId] });
    return result;
  }, [refresh, cache, session.userId]);

  return {
    entries: subjectId ? all.filter((e) => e.subjectId === subjectId) : all,
    begin: async (input) => settle(await engine.begin(input)),
    resend: async (entry) => settle(await engine.resend(entry)),
    check: async (entry) => settle(await engine.check(entry)),
    discard: async (entry) => { const ok = await engine.discard(entry); await refresh(); return ok; },
    canDiscard: engine.canDiscard,
    refresh,
    drafts: {
      get: (name) => store.getDraft(session.userId, name),
      put: (name, value) => store.putDraft(session.userId, name, value),
      clear: (name) => store.clearDraft(session.userId, name),
    },
  };
}
