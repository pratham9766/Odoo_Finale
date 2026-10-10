import { useState } from 'react';
import { Form, Input, Button, Alert, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async ({ email, password, fullName }) => {
    setError(null);
    setLoading(true);
    
    try {
      const { error: e } = await signUp(email, password, fullName);
      if (e) {
        setError(e.message || "Service unavailable. Please try again later.");
        return;
      }
      setDone(true);
    } catch (err) {
      setError("Service unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-8">
        <Title level={3} style={{ color: '#14243E', fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Check your email</Title>
        <Text type="secondary" style={{ fontSize: 16, lineHeight: 1.6, display: 'block', marginBottom: 24 }}>
          We sent a confirmation link to your email address.
          Click it to activate your account, then <Link to="/login" style={{ color: '#007780' }}>sign in</Link>.
        </Text>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Title level={3} style={{ color: '#14243E', marginBottom: 8, fontSize: 28, fontWeight: 700 }}>Create your SAMETA account</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 28, fontSize: 16 }}>
        Start connecting your business operations.
      </Text>

      {error && <Alert message={error} type="error" showIcon className="mb-6" />}

      <Form layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
        <Form.Item 
          name="fullName" 
          label={<span className="font-medium text-[#182B45]">Full name</span>} 
          rules={[{ required: true, min: 2, message: 'Enter your name' }]}
          style={{ marginBottom: 24 }}
        >
          <Input placeholder="Your Name" autoComplete="name" style={{ height: 48 }} />
        </Form.Item>
        <Form.Item 
          name="email" 
          label={<span className="font-medium text-[#182B45]">Work email</span>} 
          rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          style={{ marginBottom: 24 }}
        >
          <Input placeholder="you@company.com" autoComplete="email" style={{ height: 48 }} />
        </Form.Item>
        <Form.Item 
          name="password" 
          label={<span className="font-medium text-[#182B45]">Password</span>} 
          rules={[{ required: true, min: 8, message: 'Minimum 8 characters' }]}
          style={{ marginBottom: 32 }}
        >
          <Input.Password placeholder="Minimum 8 characters" autoComplete="new-password" style={{ height: 48 }} />
        </Form.Item>
        <Form.Item className="mb-4">
          <Button type="primary" htmlType="submit" block loading={loading} style={{ background: '#007780', height: 48, fontSize: 16, fontWeight: 600 }}>
            Create account
          </Button>
        </Form.Item>
      </Form>
      <div className="text-center mt-6">
        <Text style={{ fontSize: 15, color: '#53657A' }}>
          Already have an account? <Link to="/login" style={{ color: '#007780', fontWeight: 600 }}>Sign in</Link>
        </Text>
      </div>
    </div>
  );
}
