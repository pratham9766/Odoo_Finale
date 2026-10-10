import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Sync state to URL search params.
 * Usage: const [filters, setFilters] = useUrlState({ status: 'all', page: 1 });
 */
export function useUrlState(defaults = {}) {
  const [params, setParams] = useSearchParams();

  const state = {};
  for (const key of Object.keys(defaults)) {
    const raw = params.get(key);
    const def = defaults[key];
    if (raw === null) {
      state[key] = def;
    } else if (typeof def === 'number') {
      state[key] = Number(raw) || def;
    } else {
      state[key] = raw;
    }
  }

  const setState = useCallback((updates) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, val] of Object.entries(updates)) {
        if (val == null || val === defaults[key]) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      }
      return next;
    }, { replace: true });
  }, [setParams, defaults]);

  return [state, setState];
}
