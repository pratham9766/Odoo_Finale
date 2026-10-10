import { useEffect, useRef, useState } from 'react';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useDebouncedCallback(fn, delay = 300) {
  const ref = useRef(fn);
  ref.current = fn;
  const timerRef = useRef(null);

  return (...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => ref.current(...args), delay);
  };
}
