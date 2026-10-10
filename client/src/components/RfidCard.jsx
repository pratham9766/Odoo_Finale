import { useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Space, Tag, Tooltip } from 'antd';
import { useSession } from '@/context/Session';
import { useAction } from '@/lib/hooks';

/** 'a1:b2 c3-d4' → 'A1B2C3D4'; the server normalises and checks again. */
export const normalizeUid = (v) => (typeof v === 'string' ? v.replace(/[\s:-]/g, '').toUpperCase() : v);
const UID_RULES = [
  { required: true, message: 'Enter the card UID' },
  { validator: (_, v) => (!v || (/^[0-9A-F]{8,20}$/.test(normalizeUid(v)) && normalizeUid(v).length % 2 === 0)
    ? Promise.resolve() : Promise.reject(new Error('8–20 hex digits (4, 7 or 10 bytes), e.g. A1B2C3D4'))) },
];

/** The card a worker holds, or a muted "no card". */
export function RfidCardTag({ uid, placeholder }) {
  if (!uid) return <Tag>No card</Tag>;
  return (
    <Space size={4} wrap>
      <Tag color={placeholder ? 'gold' : 'green'} style={{ fontFamily: 'monospace' }}>{uid}</Tag>
      {placeholder && <Tooltip title="Demo UID. Scan the physical card and use Replace."><Tag color="orange">Awaiting physical card</Tag></Tooltip>}
    </Space>
  );
}

/** Assign / replace / deactivate a worker's card. Only for rfid.manage; the server checks again. */
export function RfidCardActions({ worker }) {
  const session = useSession();
  const act = useAction();
  const [mode, setMode] = useState(null);           // 'assign' | 'replace'
  const [form] = Form.useForm();
  if (!session.can('rfid.manage') || !worker?.worker_id) return null;
  const has = Boolean(worker.card_uid);

  const submit = (values) => act.mutate(
    { method: mode === 'assign' ? 'POST' : 'PUT', path: `/rfid/workers/${worker.worker_id}/card`, body: { card_uid: normalizeUid(values.card_uid) } },
    { onSuccess: () => { setMode(null); form.resetFields(); } },
  );

  return (
    <>
      <Space size={4}>
        {has
          ? <Button size="small" onClick={() => setMode('replace')}>Replace card</Button>
          : <Button size="small" type="primary" ghost onClick={() => setMode('assign')} disabled={worker.worker_active === false}>Assign card</Button>}
        {has && (
          <Popconfirm title={`Deactivate card ${worker.card_uid}?`} description="It stops working at once. Past scans are kept." okText="Deactivate" okButtonProps={{ danger: true }}
            onConfirm={() => act.mutate({ method: 'DELETE', path: `/rfid/workers/${worker.worker_id}/card` })}>
            <Button size="small" danger>Deactivate</Button>
          </Popconfirm>
        )}
      </Space>
      <Modal open={Boolean(mode)} title={`${mode === 'assign' ? 'Assign a card to' : 'Replace the card of'} ${worker.name}`}
        okText={mode === 'assign' ? 'Assign' : 'Replace'} confirmLoading={act.isPending} destroyOnHidden
        onCancel={() => setMode(null)} onOk={() => form.submit()}>
        {mode === 'replace' && <p>Current card: <RfidCardTag uid={worker.card_uid} placeholder={worker.is_placeholder} /> It will be deactivated and kept in history.</p>}
        <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
          <Form.Item name="card_uid" label="Card UID" rules={UID_RULES} normalize={normalizeUid}
            extra="Read it from the ESP32 Serial Monitor (minimal UID-reader sketch) or a scan of an unknown card in the scan log.">
            <Input autoFocus placeholder="A1B2C3D4" style={{ fontFamily: 'monospace' }} maxLength={40} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
