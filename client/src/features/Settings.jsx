import { useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Tabs, Tag } from 'antd';
import CrudPage from '@/components/CrudPage';
import { PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { clean, useAction, useGet } from '@/lib/hooks';

function MillProfile() {
  const session = useSession();
  const mill = useGet('/mill');
  const act = useAction({ success: 'Mill profile saved' });
  const [form] = Form.useForm();
  const canEdit = session.can('settings.update');

  useEffect(() => {
    const m = mill.payload;
    if (m) form.setFieldsValue({ ...m, invoice_prefix: m.settings?.invoice_prefix });
  }, [mill.payload, form]);

  function submit({ invoice_prefix, ...values }) {
    const body = clean(values);
    if (invoice_prefix) body.settings = { invoice_prefix };
    act.mutate({ method: 'PUT', path: '/mill', body });
  }

  return (
    <section className="panel" style={{ maxWidth: 720 }}>
      <QueryState query={mill}>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={!canEdit}>
          <div className="form-grid">
            <Form.Item name="name" label="Mill name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="gstin" label="GSTIN" extra="Printed on invoices"><Input maxLength={15} /></Form.Item>
            <Form.Item name="phone" label="Phone"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
            <Form.Item name="city" label="City"><Input /></Form.Item>
            <Form.Item name="state" label="State"><Input /></Form.Item>
            <Form.Item name="pincode" label="Pincode"><Input maxLength={6} /></Form.Item>
            <Form.Item name="invoice_prefix" label="Invoice prefix" extra="e.g. EVT gives EVT-0001"><Input maxLength={10} /></Form.Item>
          </div>
          <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          {canEdit && <Button type="primary" htmlType="submit" loading={act.isPending}>Save profile</Button>}
        </Form>
      </QueryState>
    </section>
  );
}

/** how much weight or length a stage loses: used to work out how much raw material an order really needs */
function LossButton({ stage }) {
  const session = useSession();
  const act = useAction({ success: 'Saved' });
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  if (!session.can('settings.update')) return null;
  return (
    <>
      <Button size="small" onClick={() => { form.setFieldsValue({ weight_loss_pct: stage.weight_loss_pct, length_shrink_pct: stage.length_shrink_pct }); setOpen(true); }}>Losses</Button>
      <Modal title={`Losses in ${stage.name}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => act.mutate({ method: 'PUT', path: `/stage-losses/${stage.id}`, body: v }, { onSuccess: () => setOpen(false) })}>
          <Form.Item name="weight_loss_pct" label="Weight lost in this stage (%)"><InputNumber min={0} max={99.9} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="length_shrink_pct" label="Length shrinkage (%)"><InputNumber min={0} max={99.9} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

const crud = { create: 'settings.create', update: 'settings.update', remove: 'settings.delete' };

export default function Settings() {
  return (
    <>
      <PageTitle title="Mill settings" description="Your mill's details, production stages, shifts, defect types and warehouses." />
      <Tabs items={[
        { key: 'profile', label: 'Mill profile', children: <MillProfile /> },
        {
          key: 'stages', label: 'Stages',
          children: (
            <CrudPage embedded noun="stage" path="/stages" perms={crud}
              columns={[
                { title: '#', dataIndex: 'sequence', width: 60 }, { title: 'Stage', dataIndex: 'name', render: (v) => <strong>{v}</strong> },
                { title: 'Produces', dataIndex: 'output_kind', render: (v) => v && <Tag>{v.replaceAll('_', ' ')}</Tag> },
                { title: 'Weight loss', dataIndex: 'weight_loss_pct', render: (v) => `${v}%` }, { title: 'Length shrink', dataIndex: 'length_shrink_pct', render: (v) => `${v}%` },
              ]}
              extraActions={(row) => <LossButton stage={row} />}
              fields={[
                { name: 'name', label: 'Stage name', required: true },
                { name: 'sequence', label: 'Order in the process (1 = first)', type: 'number', required: true, min: 1, max: 99 },
                { name: 'output_kind', label: 'Produces', type: 'select', options: [{ value: 'yarn', label: 'Yarn' }, { value: 'grey_fabric', label: 'Grey fabric' }, { value: 'finished_fabric', label: 'Finished fabric' }] },
              ]}
            />
          ),
        },
        {
          key: 'shifts', label: 'Shifts',
          children: (
            <CrudPage embedded noun="shift" path="/shifts" perms={crud}
              columns={[{ title: 'Shift', dataIndex: 'name', render: (v) => <strong>{v}</strong> }, { title: 'Starts', dataIndex: 'start_time' }, { title: 'Ends', dataIndex: 'end_time' }, { title: 'Grace (min)', dataIndex: 'grace_min' }]}
              fields={[
                { name: 'name', label: 'Shift name', required: true },
                { name: 'start_time', label: 'Start (HH:MM, 24-hour)', required: true }, { name: 'end_time', label: 'End (HH:MM, 24-hour)', required: true },
                { name: 'grace_min', label: 'Grace minutes before "late"', type: 'number', min: 0, max: 120, initial: 10 },
              ]}
            />
          ),
        },
        {
          key: 'defects', label: 'Defect types',
          children: (
            <CrudPage embedded noun="defect type" path="/defect-types" perms={crud}
              columns={[{ title: 'Code', dataIndex: 'code', width: 110 }, { title: 'Defect', dataIndex: 'name', render: (v) => <strong>{v}</strong> }, { title: 'Default severity', dataIndex: 'severity_default' }]}
              fields={[
                { name: 'code', label: 'Code', required: true, help: 'Capital letters, digits and _ only' }, { name: 'name', label: 'Name', required: true },
                { name: 'severity_default', label: 'Default severity (1 minor – 5 critical)', type: 'number', min: 1, max: 5, initial: 1 },
              ]}
            />
          ),
        },
        {
          key: 'warehouses', label: 'Warehouses',
          children: (
            <CrudPage embedded noun="warehouse" path="/warehouses" perms={crud}
              columns={[{ title: 'Warehouse', dataIndex: 'name', render: (v) => <strong>{v}</strong> }, { title: 'Holds', dataIndex: 'kind', render: (v) => <Tag>{v}</Tag> }]}
              fields={[
                { name: 'name', label: 'Name', required: true },
                { name: 'kind', label: 'Holds', type: 'select', required: true, initial: 'raw', options: ['raw', 'wip', 'finished', 'scrap'].map((v) => ({ value: v, label: v })) },
              ]}
            />
          ),
        },
      ]} />
    </>
  );
}
