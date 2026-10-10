import { useState } from 'react';
import { Form, Input, Button, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/home';
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async ({ email, password }) => {
    setError(null);
    setLoading(true);
    
    try {
      const { error: e } = await signIn(email, password);
      if (e) {
        setError(e.message || "Service unavailable. Please try again later.");
        return;
      }
      const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/home';
      navigate(safeNext, { replace: true });
    } catch (err) {
      setError("Service unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div>
        <Title level={3} style={{ color: '#14243E', marginBottom: 8, fontSize: 28, fontWeight: 700 }}>Welcome back</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 28, fontSize: 16 }}>
          Sign in to your SAMETA workspace.
        </Text>

        {error && <Alert message={error} type="error" showIcon className="mb-6" />}

        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
          <Form.Item
            name="email"
            label={<span className="font-medium text-[#182B45]">Work email</span>}
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            style={{ marginBottom: 24 }}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#53657A' }} />}
              placeholder="you@company.com"
              autoComplete="username"
              style={{ height: 48 }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={
              <div className="flex justify-between w-full items-center gap-4">
                <span className="font-medium text-[#182B45]">Password</span>
                <Link to="/forgot" style={{ fontSize: 14, color: '#007780', fontWeight: 500 }}>Forgot password?</Link>
              </div>
            }
            rules={[{ required: true, message: 'Enter your password' }]}
            style={{ marginBottom: 32 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#53657A' }} />}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ height: 48 }}
            />
          </Form.Item>

          <Form.Item className="mb-4">
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ background: '#007780', height: 48, fontSize: 16, fontWeight: 600 }}
            >
              Sign in
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-6">
          <Text style={{ fontSize: 15, color: '#53657A' }}>
            New to SAMETA?{' '}
            <Link to="/signup" style={{ color: '#007780', fontWeight: 600 }}>Create account</Link>
          </Text>
        </div>
      </div>
    </div>
  );
}
