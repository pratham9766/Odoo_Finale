import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useOrg } from '@/hooks/useOrg';
import { useAuth } from '@/hooks/useAuth';

export default function OrgRequired() {
  const { user } = useAuth();
  const { orgs, loading, org } = useOrg();

  if (!user) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" tip="Loading organization…" />
      </div>
    );
  }

  if (!loading && orgs.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  // Org list loaded but no context yet
  if (!org && orgs.length > 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" tip="Loading workspace…" />
      </div>
    );
  }

  return <Outlet />;
}
