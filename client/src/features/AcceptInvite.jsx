import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Skeleton } from 'antd';
import { request, API_URL as baseUrl, PHONE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import '@/styles/invite.css';


const PASSWORD_RULES = [
  { label: '8+ characters', test: (v) => v.length >= 8 },
  { label: 'A letter', test: (v) => /[A-Za-z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
];

/** Page frame: brand panel (left on desktop, a header on phones) and the content card. */
function Shell({ millName, role, children }) {
  return (
    <div className="invite-root">
      <aside className="invite-panel">
        <div className="invite-brand">sameta</div>
        <div className="invite-panel-body">
          <div className="invite-eyebrow">STAFF INVITATION</div>
          <h1 className="invite-title">{millName ? <>Join <span>{millName}</span></> : 'Join your mill'}</h1>
          {role && <div className="invite-role">Your role: <strong>{role}</strong></div>}
          <ol className="invite-steps">
            <li>Fill in your details</li>
            <li>Choose a password</li>
            <li>Start working, no extra setup</li>
          </ol>
        </div>
      </aside>
      <main className="invite-main">
        <div className="invite-card">{children}</div>
      </main>
    </div>
  );
}

/** Public page (no login): the person invited by email enters their details and picks a password. */
export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const password = Form.useWatch('password', form) || '';
  const [error, setError] = useState(null);
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: ({ signal }) => request(`/public/invites/${encodeURIComponent(token)}`, { baseUrl, signal }),
    retry: false,
  });

  async function submit({ confirm: _confirm, ...values }) {
    setError(null);
    setExists(false);
    setSaving(true);
    try {
      await request(`/public/invites/${encodeURIComponent(token)}/accept`, { baseUrl, method: 'POST', body: values });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.data.data.email, password: values.password });
      navigate(signInError ? '/login' : '/app', { replace: true });
    } catch (err) {
      setExists(err.code === 'ACCOUNT_EXISTS');
      setError(err.message || 'Could not create your account.');
    } finally {
      setSaving(false);
    }
  }

  if (invite.isPending) return <Shell><Skeleton active paragraph={{ rows: 8 }} /></Shell>;

  if (invite.isError) {
    return (
      <Shell>
        <div className="invite-invalid">
          <div className="invite-invalid-icon">!</div>
          <h2>This invite link is not valid</h2>
          <p>It may have expired, been used already, or been cancelled. Ask the mill owner to send a new invite.</p>
          <Link to="/login"><Button type="primary" size="large">Go to login</Button></Link>
        </div>
      </Shell>
    );
  }

  const { mill_name: millName, email, role } = invite.data.data;

  return (
    <Shell millName={millName} role={role}>
      <h2 className="invite-card-title">Create your account</h2>
      <p className="invite-card-sub">Signing up as <span className="invite-email">{email}</span></p>

      {error && (
        <Alert
          className="invite-alert"
          type="error"
          showIcon
          message={error}
          description={exists ? <Link to="/login">Log in with this email</Link> : undefined}
        />
      )}

      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} size="large" className="invite-form">
        <div className="invite-section">Your details</div>
        <Form.Item name="full_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter your full name' }]}>
          <Input autoComplete="name" placeholder="e.g. Ravi Mehta" />
        </Form.Item>
        <div className="invite-grid">
          <Form.Item name="phone" label="Phone number" rules={[{ required: true, pattern: PHONE, message: 'Enter a valid phone number' }]}>
            <Input autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" />
          </Form.Item>
          <Form.Item name="city" label="City" rules={[{ required: true, min: 2, message: 'Enter your city' }]}>
            <Input autoComplete="address-level2" placeholder="e.g. Pune" />
          </Form.Item>
        </div>
        <Form.Item name="address" label="Address" rules={[{ required: true, min: 3, message: 'Enter your address' }]}>
          <Input.TextArea rows={2} autoComplete="street-address" placeholder="House, street, area" />
        </Form.Item>

        <div className="invite-section">Set a password</div>
        <div className="invite-grid">
          <Form.Item
            name="password"
            label="Password"
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
        </div>
        <ul className="invite-rules">
          {PASSWORD_RULES.map((r) => (
            <li key={r.label} className={r.test(password) ? 'ok' : ''}>{r.label}</li>
          ))}
        </ul>

        <Button type="primary" htmlType="submit" block size="large" loading={saving} className="invite-submit">
          Create my account
        </Button>
        <p className="invite-foot">Already have an account? <Link to="/login">Log in</Link></p>
      </Form>
    </Shell>
  );
}
