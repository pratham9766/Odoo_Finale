import { useState } from 'react';
import { Alert, Button, Descriptions, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs, Tag, Timeline } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RemoteSelect } from '@/components/CrudPage';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { useAction, useGet } from '@/lib/hooks';
import { date, quantity } from '@/lib/format';

const RESULT_COLOR = { pass: 'green', passed: 'green', rework: 'orange', reject: 'red', rejected: 'red', pending_qc: 'gold' };

/** pass / rework / reject for one roll, with the defects found. An override needs a reason. */
function InspectModal({ roll, override = false, onClose }) {
  const act = useAction({ success: override ? 'Result overridden' : 'Inspection saved' });
  const [form] = Form.useForm();
  if (!roll) return null;

  function submit(v) {
    const defects = (v.defects || []).filter((d) => d?.defect_type_id).map((d) => ({ defect_type_id: d.defect_type_id, count: d.count ?? 1, severity: d.severity ?? 1 }));
    const body = { result: v.result, defects, remarks: v.remarks || undefined, ...(override ? { reason: v.reason } : {}) };
    if (override) {
      // the override endpoint is keyed by the inspection; the latest one for this roll is fetched first
      return act.mutate({ method: 'POST', path: `/qc/inspections/${roll.last_inspection_id}/override`, body }, { onSuccess: onClose });
    }
    return act.mutate({ path: '/qc/inspections', body: { roll_id: roll.id, ...body } }, { onSuccess: onClose });
  }

  return (
    <Modal title={`${override ? 'Override' : 'Inspect'} roll ${roll.roll_no}`} open width={620} onCancel={onClose} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
      <p style={{ color: '#5F6B63' }}>{roll.item} {roll.colour && `· ${roll.colour}`} · {quantity(roll.length_m)} m · {roll.order_no}</p>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ result: 'pass', defects: [] }}>
        <Form.Item name="result" label="Result" rules={[{ required: true }]}>
          <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'pass', label: 'Pass' }, { value: 'rework', label: 'Rework' }, { value: 'reject', label: 'Reject' }]} />
        </Form.Item>
        <Form.List name="defects">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Space key={f.key} align="start" wrap>
                  <Form.Item name={[f.name, 'defect_type_id']} rules={[{ required: true, message: 'Choose a defect' }]}><RemoteSelect from={{ path: '/defect-types' }} placeholder="Defect" style={{ width: 220 }} /></Form.Item>
                  <Form.Item name={[f.name, 'count']} initialValue={1}><InputNumber min={1} addonBefore="Count" /></Form.Item>
                  <Form.Item name={[f.name, 'severity']} initialValue={1}><InputNumber min={1} max={5} addonBefore="Severity" /></Form.Item>
                  <Button onClick={() => remove(f.name)}>Remove</Button>
                </Space>
              ))}
              <Button style={{ marginBottom: 16 }} onClick={() => add()}>+ Add defect</Button>
            </>
          )}
        </Form.List>
        {override && <Form.Item name="reason" label="Reason for the override" rules={[{ required: true, message: 'A reason is required' }]}><Input.TextArea rows={2} /></Form.Item>}
        <Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

function Queue({ status }) {
  const session = useSession();
  const [roll, setRoll] = useState(null);
  const list = useGet('/qc/queue', { status, limit: 100 }, { refetchInterval: status === 'pending_qc' ? 20000 : undefined });
  return (
    <>
      <QueryState query={list}>
        <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 'max-content' }} locale={{ emptyText: <NoData description="No rolls here." /> }}
          columns={[
            { title: 'Roll', dataIndex: 'roll_no', render: (v) => <Link to={`/app/rolls/${encodeURIComponent(v)}`}><strong>{v}</strong></Link> },
            { title: 'Fabric', dataIndex: 'item' }, { title: 'Order', dataIndex: 'order_no' }, { title: 'Machine', dataIndex: 'machine_code' },
            { title: 'Length (m)', dataIndex: 'length_m', align: 'right', render: quantity }, { title: 'Dye batch', dataIndex: 'dye_batch' }, { title: 'Made', dataIndex: 'created_at', render: date },
            { title: '', key: 'a', render: (_, r) => (status === 'pending_qc' && session.can('qc.inspect') ? <Button size="small" type="primary" onClick={() => setRoll(r)}>Inspect</Button> : null) },
          ]} />
      </QueryState>
      <InspectModal roll={roll} onClose={() => setRoll(null)} />
    </>
  );
}

export function Quality({ floor = false }) {
  const navigate = useNavigate();
  const summary = useGet('/qc/summary', {}, { refetchInterval: 30000 });
  const s = summary.payload;
  return (
    <>
      <PageTitle eyebrow={floor ? 'QC STATION' : 'QUALITY'} title="Quality control" description="Inspect each roll: pass, rework or reject. Every result stays on the roll's trace." />
      {s && (
        <div className="kpi-row">
          <div className="kpi"><span>Waiting for QC</span><strong>{s.queue?.pending_qc ?? 0}</strong></div>
          <div className="kpi"><span>Passed today</span><strong style={{ color: 'green' }}>{s.passed_today}</strong></div>
          <div className="kpi"><span>Rejection rate</span><strong>{s.rejection_pct ?? '–'}{s.rejection_pct != null && '%'}</strong></div>
          <div className="kpi"><span>First-pass yield</span><strong>{s.first_pass_yield_pct ?? '–'}{s.first_pass_yield_pct != null && '%'}</strong></div>
        </div>
      )}
      <section className="panel">
        <Input.Search allowClear enterButton="Trace a roll" placeholder="Roll number, e.g. R-17-001" style={{ maxWidth: 380, marginBottom: 12 }} onSearch={(v) => v.trim() && navigate(`/app/rolls/${encodeURIComponent(v.trim())}`)} />
        <Tabs items={[
          { key: 'pending_qc', label: 'Waiting for QC', children: <Queue status="pending_qc" /> },
          { key: 'passed', label: 'Passed', children: <Queue status="passed" /> },
          { key: 'rework', label: 'Rework', children: <Queue status="rework" /> },
          { key: 'rejected', label: 'Rejected', children: <Queue status="rejected" /> },
        ]} />
      </section>
    </>
  );
}

/** everything that happened to one roll: where its yarn came from, which machine and worker made it, every inspection, where it went */
export function RollTrace() {
  const { rollNo } = useParams();
  const session = useSession();
  const [overriding, setOverriding] = useState(null);
  const trace = useGet(`/rolls/${encodeURIComponent(rollNo)}/trace`);
  const t = trace.payload;
  return (
    <>
      <Link to="/app/quality">← Quality</Link>
      <PageTitle eyebrow="TRACEABILITY" title={`Roll ${rollNo}`} description="From yarn lot to buyer." action={session.can('production.log') && <Button onClick={() => session.download(`/rolls/${encodeURIComponent(rollNo)}/label.pdf`, `label-${rollNo}.pdf`).catch(() => {})}>Print label</Button>} />
      <QueryState query={trace}>
        {t && (
          <>
            <section className="panel">
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} items={[
                { key: 'i', label: 'Fabric', children: `${t.roll.item}${t.roll.colour ? ` · ${t.roll.colour}` : ''}` }, { key: 'o', label: 'Order', children: t.roll.order_no },
                { key: 's', label: 'Status', children: <Tag color={RESULT_COLOR[t.roll.status] || 'blue'}>{t.roll.status.replace('_', ' ')}</Tag> },
                { key: 'l', label: 'Length', children: `${quantity(t.roll.length_m)} m` }, { key: 'w', label: 'Weight', children: t.roll.weight_kg ? `${quantity(t.roll.weight_kg)} kg` : '–' }, { key: 'd', label: 'Dye batch', children: t.roll.dye_batch || '–' },
              ]} />
              {t.peers?.machine?.rejected > 0 && <Alert style={{ marginTop: 12 }} type="warning" showIcon message={`Machine ${t.peers.machine.code}: ${t.peers.machine.rejected} of ${t.peers.machine.total} rolls rejected in the last 30 days`} />}
            </section>
            <div className="grid-2">
              <section className="panel"><h3>History</h3>
                <Timeline items={t.timeline.map((e) => ({ children: <><strong>{e.event.replaceAll('_', ' ')}</strong> {[e.stage, e.machine, e.shift, e.worker].filter(Boolean).join(' · ')}<div style={{ fontSize: 12, color: '#8C948E' }}>{new Date(e.at).toLocaleString('en-IN')}</div></> }))} />
              </section>
              <section className="panel"><h3>Raw material</h3>
                <Table size="small" rowKey={(r) => `${r.lot_no}-${r.item}`} pagination={false} dataSource={t.raw_material_lots} locale={{ emptyText: 'No lots recorded' }}
                  columns={[{ title: 'Item', dataIndex: 'item' }, { title: 'Lot', dataIndex: 'lot_no' }, { title: 'Supplier', dataIndex: 'supplier' }]} />
                <h3 style={{ marginTop: 16 }}>Dispatch</h3>
                {t.dispatch ? <Descriptions size="small" column={1} items={[{ key: 'n', label: 'Dispatch', children: t.dispatch.dispatch_no }, { key: 'p', label: 'To', children: t.dispatch.to_party }, { key: 'v', label: 'Vehicle', children: t.dispatch.vehicle_no || '–' }, { key: 's', label: 'Status', children: t.dispatch.status }]} /> : <NoData description="Not dispatched yet." />}
              </section>
            </div>
            <section className="panel"><h3>Inspections</h3>
              <Table size="small" rowKey="id" pagination={false} dataSource={t.inspections} locale={{ emptyText: <NoData description="Not inspected yet." /> }}
                columns={[
                  { title: 'Result', dataIndex: 'result', render: (v, r) => <><Tag color={RESULT_COLOR[v]}>{v}</Tag>{r.is_override && <Tag>override</Tag>}</> },
                  { title: 'Defects', dataIndex: 'defects', render: (d) => (d?.length ? d.map((x) => `${x.defect} ×${x.count}`).join(', ') : '–') },
                  { title: 'Inspector', dataIndex: 'inspector' }, { title: 'Remarks', dataIndex: 'remarks', render: (v, r) => v || r.override_reason || '–' }, { title: 'When', dataIndex: 'inspected_at', render: (v) => new Date(v).toLocaleString('en-IN') },
                ]} />
              {session.can('qc.override') && t.inspections.length > 0 && t.roll.status !== 'packed' && (
                <Button style={{ marginTop: 12 }} onClick={() => setOverriding({ ...t.roll, last_inspection_id: t.inspections[t.inspections.length - 1].id })}>Override result</Button>
              )}
            </section>
            <InspectModal roll={overriding} override onClose={() => setOverriding(null)} />
          </>
        )}
      </QueryState>
    </>
  );
}

