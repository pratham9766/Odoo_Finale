import { useContext } from 'react';
import { MillContext } from '@/context/MillContext';

export function useMill() {
  const ctx = useContext(MillContext);
  if (!ctx) {
    throw new Error('useMill must be used within a MillProvider');
  }
  return ctx;
}

// Backwards-compatibility alias while transitioning
export const useOrg = useMill;
