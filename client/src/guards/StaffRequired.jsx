import { Navigate, Outlet } from 'react-router-dom';
import { Spin, Button, Typography } from 'antd';
import { useMill } from '@/hooks/useMill';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function StaffRequired() {
  const { user, signOut } = useAuth();
  const { loading, staff, isError, refetch } = useMill();

  if (!user) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip="Loading mill access…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16 }}>
        <Title level={4}>Failed to load access details</Title>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={refetch}>Retry</Button>
          <Button danger onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  // User logged in but not granted staff role
  if (!staff) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 24, textAlign: 'center' }}>
        <Title level={3}>Waiting for access</Title>
        <Text type="secondary" style={{ maxWidth: 420 }}>
          Your account is logged in, but you have not been assigned a staff role at Everest Textile Mills yet.
          Please contact your mill administrator to receive an invite or role.
        </Text>
        <Button type="primary" danger onClick={signOut} style={{ marginTop: 8 }}>
          Sign out
        </Button>
      </div>
    );
  }

  return <Outlet />;
}

// Backwards-compatibility alias
export const OrgRequired = StaffRequired;
