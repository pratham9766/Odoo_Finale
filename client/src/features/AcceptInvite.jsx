import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Divider, Form, Input, Result, Skeleton } from 'antd';
import { request } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/lib/title';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

/** Public page (no login): the person invited by email enters their details and picks a password. */
export default function AcceptInvite() {
  usePageTitle('Join your mill');
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: ({ signal }) => request(`/public/invites/${encodeURIComponent(token)}`, { signal }),
    retry: false,
  });

  async function submit({ confirm: _confirm, ...values }) {
    setError(null);
    setExists(false);
    setSaving(true);
    try {
      await request(`/public/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: values });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.data.data.email, password: values.password });
      navigate(signInError ? '/login' : '/app', { replace: true });
    } catch (err) {
      setExists(err.code === 'ACCOUNT_EXISTS');
      setError(err.message || 'Could not create your account.');
    } finally {
      setSaving(false);
    }
  }

  if (invite.isPending) return <div className="center"><Card className="setup-card"><Skeleton active /></Card></div>;

  if (invite.isError) {
    return (
      <div className="center">
        <Result
          status="warning"
          title="This invite link is not valid"
          subTitle="It may have expired, been used already, or been cancelled. Ask the mill owner to send a new invite."
          extra={<Link to="/login"><Button type="primary">Go to login</Button></Link>}
        />
      </div>
    );
  }

  const { mill_name: millName, email, role } = invite.data.data;

  return (
    <div className="center">
      <Card title={`Join ${millName}`} className="setup-card" style={{ maxWidth: 520, width: '100%' }}>
        <p>You were invited as <strong>{role}</strong>. Fill in your details and choose a password.</p>
        {error && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            message={error}
            description={exists ? <Link to="/login">Log in with this email</Link> : undefined}
          />
        )}
        <Form layout="vertical" onFinish={submit} requiredMark={false} initialValues={{ emergency_contact: '' }}>
          <Form.Item label="Email"><Input value={email} disabled /></Form.Item>
          <Form.Item name="full_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter your full name' }]}><Input autoComplete="name" /></Form.Item>
          <Form.Item name="phone" label="Phone number" rules={[{ required: true, pattern: PHONE, message: 'Enter a valid phone number' }]}><Input autoComplete="tel" placeholder="+91 98765 43210" /></Form.Item>
          <Form.Item name="address" label="Address" rules={[{ required: true, min: 3, message: 'Enter your address' }]}><Input.TextArea rows={2} autoComplete="street-address" /></Form.Item>
          <Form.Item name="city" label="City" rules={[{ required: true, min: 2, message: 'Enter your city' }]}><Input autoComplete="address-level2" /></Form.Item>
          <Form.Item name="emergency_contact" label="Emergency contact (name and phone), optional"><Input /></Form.Item>
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
              ({ getFieldValue }) => ({ validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))) }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>Create my account</Button>
        </Form>
      </Card>
    </div>
  );
}
