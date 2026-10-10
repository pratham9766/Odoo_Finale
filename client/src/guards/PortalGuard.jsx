import { Navigate, Outlet } from 'react-router-dom';
import { useOrg } from '@/hooks/useOrg';
import { homeFor } from '@/config/portals';

/**
 * PortalGuard: ensures the selected org has at least one of the required types.
 * On mismatch, redirects to the correct home for this org.
 */
export default function PortalGuard({ types = [] }) {
  const { org, role, permissions } = useOrg();

  if (!org) return null;

  const hasType = types.some(t => org.types?.includes(t));
  if (!hasType) {
    return <Navigate to={homeFor(org, role, permissions)} replace />;
  }

  return <Outlet />;
}
