import { Result, Button } from 'antd';
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';

/**
 * PermissionGuard: shows 403 if user lacks required permissions.
 * anyOf: user needs at least one of these permissions.
 */
export default function PermissionGuard({ anyOf = [], children }) {
  const { can } = usePermission();

  if (anyOf.length === 0 || can(...anyOf)) {
    return children;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Result
        status="403"
        title="Access denied"
        subTitle={`You need permission to access this section. Required: ${anyOf.join(' or ')}. Ask your owner or manager to grant access.`}
        extra={
          <Button type="primary" component={Link} to="/app/dashboard">
            Go to dashboard
          </Button>
        }
      />
    </div>
  );
}
