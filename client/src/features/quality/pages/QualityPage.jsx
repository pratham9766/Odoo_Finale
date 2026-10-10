import { useState, useCallback } from 'react';
import {
  Table, Tabs, Tag, Button, Input, Alert, Typography, Row, Col,
  Form, InputNumber, Select, Radio, Divider, Space, message, Skeleton,
} from 'antd';
import {
  SearchOutlined, ScanOutlined, CheckOutlined,
  CloseOutlined, RedoOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { PageHeader, SectionCard, StatusBadge, Can, KpiCard } from '@/components/common';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { fetchQCQueue, lookupRoll, submitInspection } from '../api';
import { formatDate } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';

const { Title, Text } = Typography;

const DEFECT_TYPES = [
  'Drop pick', 'Float', 'Broken end', 'Broken pick',
  'Thick & thin place', 'Stain', 'Hole', 'Crease mark',
  'Colour variation', 'Sizing defect',
];

function InspectionPanel() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [rollInput, setRollInput] = useState('');
  const [lookedUpRoll, setLookedUpRoll] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [form] = Form.useForm();

  const lookupMutation = useMutation({
    mutationFn: (rollNo) => lookupRoll({ rollNo }),
    onSuccess: (result) => {
      setLookedUpRoll(result.data || result);
      setLookupError(null);
      form.resetFields(['verdict', 'remarks', 'defects']);
    },
    onError: (err) => {
      setLookupError(err.message ?? 'Roll not found');
      setLookedUpRoll(null);
    },
    retry: false,
  });

  const inspectMutation = useMutation({
    mutationFn: (payload) => submitInspection(payload),
    onSuccess: (result) => {
      const verdict = result.data?.verdict || result?.verdict || 'inspected';
      message.success(`Roll inspected — result: ${verdict}`);
      qc.invalidateQueries({ queryKey: ['qc', 'queue'] });
      setLookedUpRoll(null);
      setRollInput('');
      form.resetFields();
    },
    onError: (err) => {
      message.error(err.message || 'Inspection failed');
    },
  });

  const handleLookup = () => {
    const trimmed = rollInput.trim();
    if (!trimmed) return;
    lookupMutation.mutate(trimmed);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        roll_no: lookedUpRoll.roll_no,
        verdict: values.verdict,
        remarks: values.remarks,
        // Zero-count defects excluded (schema requires positive counts)
        defects: (values.defects ?? []).filter(d => d && d.type && d.count > 0),
      };
      inspectMutation.mutate(payload);
    } catch { /* validation shown inline */ }
  };

  return (
    <div>
      {/* Roll lookup */}
      <SectionCard title="Look up roll">
        <div className="flex gap-3">
          <Input
            prefix={<ScanOutlined style={{ color: '#536278' }} />}
            placeholder="Enter roll number or scan QR code…"
            value={rollInput}
            onChange={e => setRollInput(e.target.value)}
            onPressEnter={handleLookup}
            style={{ maxWidth: 360 }}
            autoFocus
          />
          <Button
            type="primary"
            onClick={handleLookup}
            loading={lookupMutation.isPending}
          >
            Look up
          </Button>
        </div>

        <Alert
          className="mt-3"
          type="info"
          message="Camera scanning is available in the Floor QC workstation (/floor/qc). Manual roll number entry works here."
          icon={<InfoCircleOutlined />}
          showIcon
        />
      </SectionCard>

      {lookupError && (
        <Alert className="mt-3" type="error" message={lookupError} showIcon />
      )}

      {/* Roll info + inspection form */}
      {lookedUpRoll && (
        <div className="mt-4">
          <SectionCard title={`Roll: ${lookedUpRoll.roll_no}`}>
            <Row gutter={[16, 8]}>
              {[
                { label: 'Order', value: lookedUpRoll.order_no },
                { label: 'Item', value: `${lookedUpRoll.item_name} · ${lookedUpRoll.colour}` },
                { label: 'Length', value: `${lookedUpRoll.length_m} m` },
                { label: 'Weight', value: `${lookedUpRoll.weight_kg} kg` },
                { label: 'Machine', value: lookedUpRoll.machine_code },
                { label: 'Dye batch', value: lookedUpRoll.dye_batch },
                { label: 'Current status', value: <StatusBadge status={lookedUpRoll.status} /> },
              ].map(f => (
                <Col key={f.label} xs={12} sm={8} md={6}>
                  <div style={{ fontSize: 12, color: '#536278' }}>{f.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{f.value}</div>
                </Col>
              ))}
            </Row>
          </SectionCard>

          {lookedUpRoll.status === 'dispatched' && (
            <Alert className="mt-3" type="error" message="This roll has already been dispatched and cannot be re-inspected." showIcon />
          )}

          {lookedUpRoll.status !== 'dispatched' && (
            <SectionCard title="Inspection result" className="mt-4">
              <Form form={form} layout="vertical" requiredMark="optional">
                <Form.Item name="verdict" label="Verdict" rules={[{ required: true, message: 'Select a verdict' }]}>
                  <Radio.Group size="large">
                    <Radio.Button value="passed" style={{ color: '#18794E' }}>
                      <CheckOutlined /> Pass
                    </Radio.Button>
                    <Radio.Button value="rework" style={{ color: '#1D4ED8' }}>
                      <RedoOutlined /> Rework
                    </Radio.Button>
                    <Radio.Button value="rejected" style={{ color: '#B42318' }}>
                      <CloseOutlined /> Reject
                    </Radio.Button>
                  </Radio.Group>
                </Form.Item>

                <Form.List name="defects">
                  {(fields, { add, remove }) => (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#12233F', marginBottom: 8 }}>
                        Defects <Text type="secondary">(only non-zero counts submitted)</Text>
                      </div>
                      {fields.map(({ key, name }) => (
                        <Row key={key} gutter={12} className="mb-2">
                          <Col xs={14}>
                            <Form.Item name={[name, 'type']} noStyle>
                              <Select placeholder="Defect type" style={{ width: '100%' }}
                                options={DEFECT_TYPES.map(d => ({ value: d, label: d }))} />
                            </Form.Item>
                          </Col>
                          <Col xs={6}>
                            <Form.Item name={[name, 'count']} noStyle>
                              <InputNumber min={1} placeholder="Count" style={{ width: '100%' }} inputMode="numeric" />
                            </Form.Item>
                          </Col>
                          <Col xs={4}>
                            <Button danger type="text" onClick={() => remove(name)}>✕</Button>
                          </Col>
                        </Row>
                      ))}
                      <Button size="small" onClick={() => add()}>+ Add defect</Button>
                    </div>
                  )}
                </Form.List>

                <Form.Item name="remarks" label="Remarks" className="mt-3">
                  <Input.TextArea rows={2} placeholder="Optional inspection notes…" />
                </Form.Item>

                <Button
                  type="primary"
                  size="large"
                  onClick={handleSubmit}
                  loading={inspectMutation.isPending}
                  disabled={inspectMutation.isPending}
                  style={{ minWidth: 200 }}
                >
                  Submit inspection
                </Button>
                <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                  Rework returns to QC after completion. Rejected rolls are excluded from dispatch.
                </Text>
              </Form>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

export default function QualityPage() {
  const { can } = usePermission();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useUrlStateSingle('tab', 'queue');

  // Subscribe to QC queue changes (documented socket event)
  useSocketEvent('qc.queue_changed', () => qc.invalidateQueries({ queryKey: ['qc', 'queue'] }));

  const { data, isLoading } = useQuery({
    queryKey: ['qc', 'queue'],
    queryFn: ({ signal }) => fetchQCQueue({ signal }),
    staleTime: 30_000,
  });

  const counts = data?.meta?.by_status ?? {};
  const pending = data?.data?.filter((r) => r.status === 'pending_qc') ?? [];

  const columns = [
    { title: 'Roll no.', dataIndex: 'roll_no', key: 'roll_no', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>, width: 140 },
    { title: 'Order', dataIndex: 'order_no', key: 'order_no', responsive: ['sm'] },
    { title: 'Item · Colour', key: 'item', render: (_, r) => `${r.item_name} · ${r.colour}`, responsive: ['md'] },
    { title: 'Length', dataIndex: 'length_m', key: 'length_m', render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v} m</span>, align: 'right', width: 90 },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <StatusBadge status={v} />, width: 130 },
    ...(can(P.QC_INSPECT) ? [{
      title: '',
      key: 'inspect',
      render: (_, r) => (
        r.status === 'pending_qc' || r.status === 'rework'
          ? <Button size="small" type="primary" onClick={() => setActiveTab('inspect')}>Inspect</Button>
          : null
      ),
      width: 90,
    }] : []),
  ];

  const tabItems = [
    {
      key: 'queue',
      label: (
        <span>Queue <Tag color="warning" style={{ marginLeft: 4 }}>{counts.pending_qc ?? pending.length}</Tag></span>
      ),
      children: (
        <div className="tl-table-container">
          <Table
            dataSource={data?.data ?? []}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="middle"
            pagination={{ pageSize: 20 }}
            style={{ background: '#fff', borderRadius: 8, border: '1px solid #DCE3E9' }}
          />
        </div>
      ),
    },
    ...(can(P.QC_INSPECT) ? [{
      key: 'inspect',
      label: 'Inspect roll',
      children: <InspectionPanel />,
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Quality control"
        subtitle="Roll inspection, QC queue and traceability"
      />

      {/* Summary */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <KpiCard label="Pending QC" value={counts.pending_qc ?? pending.length} status={pending.length > 0 ? 'warn' : 'ok'} loading={isLoading} />
        <KpiCard label="Passed" value={counts.passed ?? 0} status="ok" loading={isLoading} />
        <KpiCard label="Rework" value={counts.rework ?? 0} status="info" loading={isLoading} />
        <KpiCard label="Rejected" value={counts.rejected ?? 0} status={counts.rejected > 0 ? 'bad' : 'muted'} loading={isLoading} />
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}

// Simple single-param URL state hook
function useUrlStateSingle(key, defaultVal) {
  const [params, setParams] = useState(new URLSearchParams(window.location.search));
  const val = params.get(key) ?? defaultVal;
  const set = (v) => {
    const next = new URLSearchParams(window.location.search);
    if (v === defaultVal) next.delete(key); else next.set(key, v);
    window.history.replaceState({}, '', '?' + next);
    setParams(next);
  };
  return [val, set];
}
