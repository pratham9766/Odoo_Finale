import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Row, Col, Input, Button, Table, Tag, Alert, Space, Divider,
  Form, message, Typography, Card, Skeleton, Descriptions,
} from 'antd';
import {
  ScanOutlined, CheckOutlined, DeleteOutlined,
  StopOutlined, CarOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { PageHeader, SectionCard, StatusBadge, Can, ConfirmButton, QtyText } from '@/components/common';
import { fetchDispatch, scanRoll, removePackingRow, confirmDispatch } from '../api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';

const { Text } = Typography;

// Error code → human message (backend error mapping)
const SCAN_ERRORS = {
  NOT_FOUND:        (rn) => `Roll ${rn} not found in this order`,
  ALREADY_DISPATCHED: (rn) => `Roll ${rn} has already been dispatched`,
  NOT_APPROVED:     (rn) => `Roll ${rn} has not passed QC — cannot dispatch`,
  DUPLICATE:        (rn) => `Roll ${rn} already in this packing list`,
  QUANTITY_EXCEEDED:(rn) => `Adding roll ${rn} would exceed the remaining approved quantity`,
  WRONG_ORDER:      (rn) => `Roll ${rn} belongs to a different order`,
};

function mapScanError(code, rollNo) {
  const fn = SCAN_ERRORS[code];
  return fn ? fn(rollNo) : `Scan rejected: ${code}`;
}

export default function DispatchScanPage() {
  const { id } = useParams();
  const { orgId } = useOrg();
  const { can } = usePermission();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [manualInput, setManualInput] = useState('');
  const [packingRows, setPackingRows] = useState([]); // successful scans
  const [failedAttempts, setFailedAttempts] = useState([]); // failed scans (separate list)
  const [scanPending, setScanPending] = useState(false);
  const [confirmForm] = Form.useForm();
  const inputRef = useRef(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dispatch', orgId, id],
    queryFn: ({ signal }) => fetchDispatch({ id, orgId, signal }),
    enabled: !!orgId && !!id,
  });

  const dispatch = data?.data;
  const isConfirmed = dispatch && ['in_transit', 'delivered', 'reached'].includes(dispatch.status);

  const scanMutation = useMutation({
    mutationFn: (roll_no) => scanRoll({ id, orgId, roll_no }),
    onSuccess: (result, roll_no) => {
      if (result.error) {
        // Failed scan — keep in separate list
        const errMsg = mapScanError(result.error.code, roll_no);
        setFailedAttempts(prev => [{ roll_no, error: errMsg, key: `fail-${Date.now()}` }, ...prev]);
      } else {
        setPackingRows(prev => [...prev, { ...result.data, key: result.data.roll_no }]);
      }
      setManualInput('');
      setScanPending(false);
      inputRef.current?.focus();
    },
    onError: (err, roll_no) => {
      setFailedAttempts(prev => [{ roll_no, error: err.message, key: `fail-${Date.now()}` }, ...prev]);
      setScanPending(false);
    },
    retry: false,
  });

  const removeMutation = useMutation({
    mutationFn: (roll_no) => removePackingRow({ id, orgId, roll_no }),
    onSuccess: (_, roll_no) => {
      setPackingRows(prev => prev.filter(r => r.roll_no !== roll_no));
    },
    retry: false,
  });

  const confirmMutation = useMutation({
    mutationFn: (payload) => confirmDispatch({ id, orgId, payload }),
    onSuccess: () => {
      message.success('Dispatch confirmed — shipment locked');
      qc.invalidateQueries({ queryKey: ['dispatch', orgId, id] });
      qc.invalidateQueries({ queryKey: ['orders', orgId] });
    },
    onError: (err) => {
      message.error(err.message ?? 'Could not confirm the result. Refresh to check before retrying.');
      err._handled = true;
    },
    retry: false,
  });

  const handleScan = useCallback((roll_no) => {
    const trimmed = (roll_no ?? manualInput).trim();
    if (!trimmed || scanPending || scanMutation.isPending) return;
    // Debounce identical codes
    if (packingRows.some(r => r.roll_no === trimmed)) {
      setFailedAttempts(prev => [{ roll_no: trimmed, error: `Roll ${trimmed} already in packing list`, key: `dup-${Date.now()}` }, ...prev]);
      return;
    }
    setScanPending(true);
    scanMutation.mutate(trimmed);
  }, [manualInput, scanPending, scanMutation, packingRows]);

  const totalLength = packingRows.reduce((acc, r) => acc + (r.length_m ?? 0), 0);

  const canConfirm =
    packingRows.length > 0 &&
    can(P.DISPATCH_CONFIRM) &&
    !scanMutation.isPending &&
    !removeMutation.isPending &&
    !isConfirmed;

  if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (isError || !dispatch) return (
    <Alert type="error" message="Dispatch not found"
      action={<Button onClick={() => navigate('/app/dispatch')}>Back</Button>} />
  );

  return (
    <div>
      <PageHeader
        title={dispatch.dispatch_no}
        breadcrumbs={[
          { title: <Link to="/app/dispatch">Dispatch</Link> },
          { title: dispatch.dispatch_no },
        ]}
        subtitle={`${dispatch.buyer_name} · ${dispatch.order_no}`}
      />

      {isConfirmed && (
        <Alert className="mb-4" type="info" showIcon icon={<StopOutlined />}
          message="This dispatch has been confirmed and is locked. No further roll changes can be made." />
      )}

      <Row gutter={[16, 16]}>
        {/* Left: scan area */}
        <Col xs={24} xl={16}>
          {/* Scan input */}
          {!isConfirmed && (
            <SectionCard title="Scan or enter roll number" className="mb-4">
              <div className="flex gap-3">
                <Input
                  ref={inputRef}
                  prefix={<ScanOutlined style={{ color: '#536278' }} />}
                  placeholder="Roll number or QR code…"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  onPressEnter={() => handleScan()}
                  disabled={scanMutation.isPending}
                  autoFocus
                  size="large"
                />
                <Button
                  type="primary"
                  size="large"
                  onClick={() => handleScan()}
                  loading={scanMutation.isPending}
                >
                  Add
                </Button>
              </div>
              <div style={{ fontSize: 12, color: '#536278', marginTop: 8 }}>
                Camera scanning available in /floor/dispatch. Camera and manual entry use the same validation.
              </div>
            </SectionCard>
          )}

          {/* Failed attempts — separate from packing rows */}
          {failedAttempts.length > 0 && (
            <SectionCard title={`Failed attempts (${failedAttempts.length})`} className="mb-4">
              {failedAttempts.slice(0, 5).map(f => (
                <Alert
                  key={f.key}
                  type="error"
                  showIcon
                  message={`${f.roll_no}: ${f.error}`}
                  style={{ marginBottom: 6 }}
                  closable
                />
              ))}
              {failedAttempts.length > 5 && (
                <Text type="secondary" style={{ fontSize: 12 }}>+{failedAttempts.length - 5} more failed attempts</Text>
              )}
            </SectionCard>
          )}

          {/* Packing rows */}
          <SectionCard
            title={`Packing list (${packingRows.length} rolls · ${totalLength.toLocaleString('en-IN')} m)`}
          >
            {packingRows.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#536278' }}>
                No rolls scanned yet. Scan or enter roll numbers above.
              </div>
            ) : (
              <Table
                dataSource={packingRows}
                rowKey="roll_no"
                size="small"
                pagination={false}
                columns={[
                  { title: 'Roll no.', dataIndex: 'roll_no', key: 'roll_no', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
                  { title: 'Length', dataIndex: 'length_m', key: 'length_m', render: v => <QtyText value={v} uom="m" />, align: 'right', width: 80 },
                  { title: 'Order', dataIndex: 'order_no', key: 'order_no', responsive: ['sm'] },
                  ...(!isConfirmed ? [{
                    title: '',
                    key: 'remove',
                    render: (_, r) => (
                      <ConfirmButton
                        title={`Remove roll ${r.roll_no}?`}
                        description="It will be removed from this packing list."
                        danger
                        onConfirm={() => removeMutation.mutate(r.roll_no)}
                        type="text"
                      >
                        <DeleteOutlined />
                      </ConfirmButton>
                    ),
                    width: 50,
                  }] : []),
                ]}
              />
            )}
          </SectionCard>
        </Col>

        {/* Right: packing summary + confirm */}
        <Col xs={24} xl={8}>
          <SectionCard title="Shipment summary">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Buyer">{dispatch.buyer_name}</Descriptions.Item>
              <Descriptions.Item label="Order">{dispatch.order_no}</Descriptions.Item>
              <Descriptions.Item label="Rolls added">{packingRows.length}</Descriptions.Item>
              <Descriptions.Item label="Total length">
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {totalLength.toLocaleString('en-IN')} m
                </span>
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            {!isConfirmed && (
              <Form form={confirmForm} layout="vertical" requiredMark="optional">
                <Form.Item name="vehicle_no" label="Vehicle number" rules={[{ required: true }]}>
                  <Input placeholder="e.g. GJ05AB1234" />
                </Form.Item>
                <Form.Item name="driver_name" label="Driver name">
                  <Input placeholder="Driver full name" />
                </Form.Item>
                <Form.Item name="driver_phone" label="Driver mobile">
                  <Input placeholder="10-digit mobile" inputMode="tel" />
                </Form.Item>
              </Form>
            )}

            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="Server validates before confirming"
              description="Frontend validation cannot guarantee stock consistency. The server will revalidate all rolls before confirming. A lost response does not prove failure — refresh before retrying."
              style={{ marginBottom: 16 }}
            />

            <ConfirmButton
              title={`Confirm dispatch — ${packingRows.length} rolls, ${totalLength.toLocaleString('en-IN')} m`}
              description={`Buyer: ${dispatch.buyer_name}. Once confirmed, this dispatch is locked and cannot be edited.`}
              onConfirm={async () => {
                try {
                  const transport = await confirmForm.validateFields();
                  confirmMutation.mutate({ ...transport });
                } catch {}
              }}
              type="primary"
              disabled={!canConfirm}
              loading={confirmMutation.isPending}
            >
              <CheckOutlined /> Confirm dispatch
            </ConfirmButton>
          </SectionCard>
        </Col>
      </Row>
    </div>
  );
}
