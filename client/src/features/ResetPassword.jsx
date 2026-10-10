import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Skeleton } from 'antd';
import { supabase } from '@/lib/supabase';
import '@/styles/invite.css';

/** Opened from the password-reset email: Supabase signs the person in with a recovery session, they choose a new password. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(null);   // null = checking the link, true = can set a password, false = bad link
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) { done = true; setReady(true); }
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) { done = true; setReady(true); } });
    const timer = setTimeout(() => { if (!done) setReady(false); }, 4000);   // the link's tokens never arrived
    return () => { sub.subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function submit({ password }) {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) setError(updateError.message);
    else navigate('/', { replace: true });
  }

  return (
    <div className="invite-root">
      <aside className="invite-panel">
        <div className="invite-brand">sameta</div>
        <div className="invite-panel-body">
          <div className="invite-eyebrow">ACCOUNT</div>
          <h1 className="invite-title">Reset your <span>password</span></h1>
        </div>
      </aside>
      <main className="invite-main">
        <div className="invite-card">
          {ready === null && <Skeleton active paragraph={{ rows: 4 }} />}
          {ready === false && (
            <div className="invite-invalid">
              <div className="invite-invalid-icon">!</div>
              <h2>This reset link is not valid</h2>
              <p>It may have expired or been used already. Go back to login and click &quot;Forgot password?&quot; again.</p>
              <Link to="/login"><Button type="primary" size="large">Go to login</Button></Link>
            </div>
          )}
          {ready && (
            <>
              <h2 className="invite-card-title">Choose a new password</h2>
              <p className="invite-card-sub">You will be signed in when it is saved.</p>
              {error && <Alert className="invite-alert" type="error" showIcon message={error} />}
              <Form layout="vertical" requiredMark={false} size="large" onFinish={submit} className="invite-form">
                <Form.Item name="password" label="New password" extra="At least 8 characters, with a letter and a number."
                  rules={[
                    { required: true, message: 'Choose a password' },
                    { min: 8, message: 'At least 8 characters' },
                    { pattern: /[A-Za-z]/, message: 'Include a letter' },
                    { pattern: /[0-9]/, message: 'Include a number' },
                  ]}>
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="confirm" label="Confirm password" dependencies={['password']}
                  rules={[
                    { required: true, message: 'Repeat the password' },
                    ({ getFieldValue }) => ({ validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))) }),
                  ]}>
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" block loading={saving} className="invite-submit">Save password</Button>
              </Form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
