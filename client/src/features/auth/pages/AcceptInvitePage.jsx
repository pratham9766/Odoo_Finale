import { useState } from 'react';
import { Form, Input, Button, Alert, Typography, Spin, Result, Divider } from 'antd';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export default function AcceptInvitePage() {
  const { token } = useParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);

  const inviteQ = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get(`/public/invites/${encodeURIComponent(token)}`).then((r) => r.data),
    retry: false,
  });

  const submit = async ({ confirm: _confirm, ...values }) => {
    setError(null);
    setExists(false);
    setSaving(true);
    try {
      await api.post(`/public/invites/${encodeURIComponent(token)}/accept`, values);
      const { error: e } = await signIn(inviteQ.data.email, values.password);
      if (e) {
        navigate('/login', { replace: true });
        return;
      }
      navigate('/home', { replace: true });
    } catch (err) {
      if (err.code === 'ACCOUNT_EXISTS') setExists(true);
      setError(err.details?.fieldErrors ? 'Please check the highlighted fields.' : err.message || 'Could not create your account');
    } finally {
      setSaving(false);
    }
  };

  if (inviteQ.isLoading) {
    return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  }

  if (inviteQ.isError) {
    return (
      <Result
        status="warning"
        title="This invite link is not valid"
        subTitle="It may have expired, been used already, or been cancelled. Ask the mill owner to send a new invite."
        extra={<Link to="/login"><Button type="primary">Go to login</Button></Link>}
      />
    );
  }

  const { mill_name, email, role } = inviteQ.data;

  return (
    <div className="w-full">
      <Title level={3} style={{ color: '#14243E', marginBottom: 8, fontSize: 28, fontWeight: 700 }}>
        Join {mill_name}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20, fontSize: 15 }}>
        You were invited as <strong>{role}</strong>. Fill in your details and choose a password.
      </Text>

      {error && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message={error}
          description={exists ? <Link to="/login">Log in with this email</Link> : undefined}
        />
      )}

      <Form layout="vertical" onFinish={submit} requiredMark={false} size="large" initialValues={{ emergency_contact: '' }}>
        <Form.Item label="Email">
          <Input value={email} disabled />
        </Form.Item>

        <Form.Item name="full_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter your full name' }]}>
          <Input autoComplete="name" />
        </Form.Item>

        <Form.Item name="phone" label="Phone number" rules={[{ required: true, pattern: PHONE, message: 'Enter a valid phone number' }]}>
          <Input autoComplete="tel" placeholder="+91 98765 43210" />
        </Form.Item>

        <Form.Item name="address" label="Address" rules={[{ required: true, min: 3, message: 'Enter your address' }]}>
          <Input.TextArea rows={2} autoComplete="street-address" />
        </Form.Item>

        <Form.Item name="city" label="City" rules={[{ required: true, min: 2, message: 'Enter your city' }]}>
          <Input autoComplete="address-level2" />
        </Form.Item>

        <Form.Item name="emergency_contact" label="Emergency contact (name and phone), optional">
          <Input />
        </Form.Item>

        <Divider style={{ margin: '8px 0 16px' }} />

        <Form.Item
          name="password"
          label="Password"
          extra="At least 8 characters, with a letter and a number."
          rules={[
            { required: true, message: 'Choose a password' },
            { min: 8, message: 'At least 8 characters' },
            { pattern: /[A-Za-z]/, message: 'Include a letter' },
            { pattern: /[0-9]/, message: 'Include a number' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="confirm"
          label="Confirm password"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Repeat the password' },
            ({ getFieldValue }) => ({
              validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={saving} style={{ background: '#007780', height: 48, fontWeight: 600 }}>
          Create my account
        </Button>
      </Form>
    </div>
  );
}
