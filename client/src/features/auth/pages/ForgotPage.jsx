import { useState } from 'react';
import { Form, Input, Button, Alert, Typography, Result } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function ForgotPage() {
  const { resetPassword } = useAuth();
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async ({ email }) => {
    setError(null);
    setLoading(true);
    try {
      const { error: e } = await resetPassword(email);
      if (e) { setError(e.message); return; }
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <Result
      status="success"
      title="Check your inbox"
      subTitle="If an account with that email exists, you'll receive a reset link shortly."
      extra={<Link to="/login"><Button type="primary">Back to login</Button></Link>}
    />
  );

  return (
    <div>
      <Title level={3} style={{ color: '#12233F', marginBottom: 4 }}>Reset password</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 28 }}>
        Enter your email and we'll send a reset link.
      </Text>
      {error && <Alert message={error} type="error" showIcon className="mb-4" />}
      <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
          <Input size="large" placeholder="you@company.com" autoComplete="email" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={loading}>
          Send reset link
        </Button>
      </Form>
      <div className="text-center mt-4">
        <Link to="/login" style={{ color: '#006B73', fontSize: 14 }}>Back to login</Link>
      </div>
    </div>
  );
}
