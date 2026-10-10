import { useContext } from 'react';
import { OrgContext } from '@/context/OrgContext';

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}
