import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { supabase } from '@/lib/supabase';
import DemoLogin from './DemoLogin';
export default function Login({ initialError }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(values) {
    setBusy(true); setError(null);
    try { const result = await supabase.auth.signInWithPassword(values); if (result.error) throw result.error; }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="login"><section className="login-story"><div className="brand">sameta<span> / </span></div><div><div className="eyebrow">EVERY THREAD. CONNECTED.</div><h1>A clearer view<br />of your mill.</h1><p>From the first yarn receipt to the last finished roll. Keep your people, production and orders moving together.</p></div><span>TEXTILE OPERATIONS / WORKSPACE</span></section><section className="login-form"><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your workspace</h2><p>Use your team's registered account.</p>{error && <Alert className="mb-4" type="error" showIcon message={error} />}<Form layout="vertical" onFinish={submit} requiredMark="optional"><Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}><Input size="large" autoComplete="username" /></Form.Item><Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password.' }]}><Input.Password size="large" autoComplete="current-password" /></Form.Item><Button type="primary" htmlType="submit" size="large" loading={busy} block>Sign in</Button></Form>{import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_SWITCHER === 'true' && <DemoLogin />}</section></main>;
}
