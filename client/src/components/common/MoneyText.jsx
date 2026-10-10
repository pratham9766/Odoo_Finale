import { usePermission } from '@/hooks/usePermission';
import { useOrg } from '@/hooks/useOrg';
import { formatINR } from '@/lib/format';

/**
 * MoneyText — renders INR amount, or '—' if user lacks the permission.
 * Default permission: 'orders.view_price' — callers can override.
 */
export default function MoneyText({ value, perm = 'orders.view_price', fallback = '—' }) {
  const { permissions } = useOrg();
  if (!permissions.has(perm)) return <span style={{ color: '#536278' }}>{fallback}</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatINR(value)}</span>;
}
