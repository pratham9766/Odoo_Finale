import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Result, Skeleton } from 'antd';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/lib/title';

export default function ResetPassword() {
  usePageTitle('Reset password');
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) { setChecking(false); return undefined; }
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive && session) { setHasSession(true); setChecking(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setHasSession(!!data.session); setChecking(false); }
    }).catch((err) => { if (alive) { setError(err.message); setChecking(false); } });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit({ password }) {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      await supabase.auth.signOut();
      setDone(true);
    }
    setSaving(false);
  }

  if (checking) return <div className="center"><Card className="setup-card"><Skeleton active /></Card></div>;
  if (done) return <div className="center"><Result status="success" title="Password updated" subTitle="Sign in with your new password." extra={<Link to="/login"><Button type="primary">Go to sign in</Button></Link>} /></div>;
  if (!hasSession) return <div className="center"><Result status="warning" title="This reset link is not valid" subTitle="It may have expired or already been used. Request another link from the sign-in page." extra={<Link to="/login"><Button type="primary">Back to sign in</Button></Link>} /></div>;

  return (
    <div className="center">
      <Card title="Choose a new password" className="setup-card" style={{ width: '100%', maxWidth: 440 }}>
        {error && <Alert className="mb-4" type="error" showIcon message={error} />}
        <Form layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item name="password" label="New password" rules={[
            { required: true, message: 'Enter a new password' },
            { min: 8, message: 'At least 8 characters' },
            { pattern: /[A-Za-z]/, message: 'Include a letter' },
            { pattern: /[0-9]/, message: 'Include a number' },
          ]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="confirm" label="Confirm password" dependencies={['password']} rules={[
            { required: true, message: 'Repeat the password' },
            ({ getFieldValue }) => ({ validator: (_, value) => (!value || value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))) }),
          ]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>Update password</Button>
        </Form>
      </Card>
    </div>
  );
}
