import { useState } from 'react';
import { Alert, Button, Card, Form, Input } from 'antd';
export default function CreateWorkspace({ api, onCreated, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(values) {
    setBusy(true); setError(null);
    try { await api('/me/orgs', { method: 'POST', body: { ...values, types: ['manufacturer'] } }); await onCreated(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="center"><Card title="Set up your mill" className="setup-card"><p>Create a workspace for your team. Default production stages, shifts and owner permissions are created by the server.</p>{error && <Alert className="mb-4" type="error" message={error} />}<Form layout="vertical" onFinish={submit}><Form.Item name="name" label="Mill name" rules={[{required:true, min:2, max:160}]}><Input maxLength={160} /></Form.Item><Form.Item name="city" label="City"><Input maxLength={80} /></Form.Item><Button type="primary" htmlType="submit" loading={busy}>Create mill</Button><Button onClick={async () => { try { await onSignOut(); } catch (err) { setError(err.message); } }}>Sign out</Button></Form></Card></div>;
}
