import { usePermission } from '@/hooks/usePermission';

/**
 * Can — renders children only if user has the required permission(s).
 * Usage: <Can perm="dispatch.confirm"> or <Can anyOf={['a','b']}>
 */
export default function Can({ perm, anyOf, children, fallback = null }) {
  const { can } = usePermission();
  const list = anyOf ?? (perm ? [perm] : []);
  if (list.length === 0) return children;
  return can(...list) ? children : fallback;
}
