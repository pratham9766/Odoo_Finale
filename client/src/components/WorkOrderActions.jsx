import { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space } from 'antd';
import { useSession } from '@/context/Session';
import { useAction } from '@/lib/hooks';

/**
 * The floor actions on one work order: start, pause, resume, log output, finish, add a roll.
 * `status` is the work order's status (planned, running, paused).
 */
export default function WorkOrderActions({ id, status, uom, compact = false }) {
  const session = useSession();
  const act = useAction();
  const [modal, setModal] = useState(null);   // 'log' | 'pause' | 'finish' | 'roll'
  const [form] = Form.useForm();
  if (!session.can('production.log') || !id) return null;

  const post = (suffix, body) => act.mutate({ path: `/work-orders/${id}/${suffix}`, body }, { onSuccess: () => setModal(null) });
  const open = (m) => { form.resetFields(); setModal(m); };
  const size = compact ? 'small' : 'middle';

  const submit = (v) => {
    if (modal === 'log') post('logs', { qty: v.qty });
    if (modal === 'pause') post('pause', v.reason ? { reason: v.reason } : {});
    if (modal === 'finish') post('finish', { good_qty: v.good_qty, waste_qty: v.waste_qty ?? 0 });
    if (modal === 'roll') act.mutate({ path: '/rolls', body: { work_order_id: id, length_m: v.length_m, ...(v.weight_kg ? { weight_kg: v.weight_kg } : {}) } }, { onSuccess: () => setModal(null) });
  };

  const titles = { log: 'Log output', pause: 'Pause work order', finish: 'Finish work order', roll: 'Add a roll' };
  return (
    <>
      <Space wrap size={4}>
        {status === 'planned' && <Button size={size} type="primary" loading={act.isPending} onClick={() => post('start')}>Start</Button>}
        {status === 'paused' && <Button size={size} type="primary" loading={act.isPending} onClick={() => post('resume')}>Resume</Button>}
        {status === 'running' && <Button size={size} type="primary" onClick={() => open('log')}>Log output</Button>}
        {status === 'running' && <Button size={size} onClick={() => open('roll')}>Add roll</Button>}
        {status === 'running' && <Button size={size} onClick={() => open('pause')}>Pause</Button>}
        {(status === 'running' || status === 'paused') && (
          <Button size={size} danger onClick={() => open('finish')}>Finish</Button>
        )}
      </Space>
      <Modal title={titles[modal]} open={!!modal} onCancel={() => setModal(null)} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          {modal === 'log' && <Form.Item name="qty" label={`Output since the last entry (${uom || 'units'})`} rules={[{ required: true, message: 'Enter the quantity' }]}><InputNumber min={0.001} style={{ width: '100%' }} autoFocus /></Form.Item>}
          {modal === 'pause' && <Form.Item name="reason" label="Reason (optional)"><Input /></Form.Item>}
          {modal === 'finish' && (
            <>
              <Form.Item name="good_qty" label={`Good output (${uom || 'units'})`} rules={[{ required: true, message: 'Enter the good quantity' }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="waste_qty" label="Waste"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            </>
          )}
          {modal === 'roll' && (
            <>
              <Form.Item name="length_m" label="Length (m)" rules={[{ required: true, message: 'Enter the length' }]}><InputNumber min={0.1} style={{ width: '100%' }} autoFocus /></Form.Item>
              <Form.Item name="weight_kg" label="Weight (kg), optional"><InputNumber min={0.1} style={{ width: '100%' }} /></Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}

