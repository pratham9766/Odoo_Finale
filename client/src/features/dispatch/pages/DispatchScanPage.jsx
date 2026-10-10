import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Row, Col, Input, Button, Table, Tag, Alert, Space, Divider,
  Form, message, Typography, Card, Skeleton, Descriptions,
} from 'antd';
import {
  ScanOutlined, CheckOutlined, DeleteOutlined, FilePdfOutlined,
  CarOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { P } from '@/lib/permissions';
import { PageHeader, SectionCard, StatusBadge, ConfirmButton } from '@/components/common';
import { fetchDispatch, scanRoll, removePackingRow, confirmDispatch, downloadPackingListPdf } from '../api';
import { formatDate, formatDateTime } from '@/lib/format';

const { Text } = Typography;

export default function DispatchScanPage() {
  const { id } = useParams();
  const { can } = usePermission();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [manualInput, setManualInput] = useState('');
  const [failedAttempts, setFailedAttempts] = useState([]);
  const [scanPending, setScanPending] = useState(false);
  const inputRef = useRef(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dispatches', id],
    queryFn: ({ signal }) => fetchDispatch({ id, signal }),
    enabled: !!id,
  });

  const dispatch = data?.data || data;
  const isConfirmed = dispatch && ['confirmed', 'in_transit', 'delivered'].includes(dispatch.status);
  const rolls = dispatch?.rolls || [];

  const scanMutation = useMutation({
    mutationFn: (code) => scanRoll({ id, code }),
    onSuccess: () => {
      message.success('Roll scanned successfully');
      setManualInput('');
      setScanPending(false);
      qc.invalidateQueries({ queryKey: ['dispatches', id] });
      inputRef.current?.focus();
    },
    onError: (err, code) => {
      setFailedAttempts((prev) => [{ roll_no: code, error: err.message, key: `fail-${Date.now()}` }, ...prev]);
      setScanPending(false);
      message.error(err.message || 'Scan rejected');
    },
    retry: false,
  });

  const removeMutation = useMutation({
    mutationFn: (rollId) => removePackingRow({ id, rollId }),
    onSuccess: () => {
      message.info('Roll removed from packing list');
      qc.invalidateQueries({ queryKey: ['dispatches', id] });
    },
    onError: (err) => {
      message.error(err.message || 'Failed to remove roll');
    },
    retry: false,
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmDispatch({ id }),
    onSuccess: () => {
      message.success('Dispatch confirmed — invoice generated & rolls marked dispatched');
      qc.invalidateQueries({ queryKey: ['dispatches', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      message.error(err.message || 'Could not confirm dispatch');
    },
    retry: false,
  });

  const handleScan = useCallback(
    (code) => {
      const trimmed = (code ?? manualInput).trim();
      if (!trimmed || scanPending || scanMutation.isPending) return;
      if (rolls.some((r) => r.roll_no === trimmed)) {
        message.warning(`Roll ${trimmed} is already in this dispatch`);
        return;
      }
      setScanPending(true);
      scanMutation.mutate(trimmed);
    },
    [manualInput, scanPending, scanMutation, rolls]
  );

  if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (isError || !dispatch) {
    return (
      <Alert
        type="error"
        message="Dispatch not found"
        action={<Button onClick={() => navigate('/app/dispatch')}>Back</Button>}
      />
    );
  }

  const columns = [
    { title: 'Roll No', dataIndex: 'roll_no', key: 'roll_no', render: (v) => <strong>{v}</strong> },
    { title: 'Item', dataIndex: 'item', key: 'item' },
    { title: 'Length (m)', dataIndex: 'length_m', key: 'length_m', align: 'right' },
    { title: 'Scanned At', dataIndex: 'scanned_at', key: 'scanned_at', render: (v) => formatDateTime(v) },
    ...(!isConfirmed
      ? [
          {
            title: '',
            key: 'action',
            render: (_, r) => (
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={removeMutation.isPending}
                onClick={() => removeMutation.mutate(r.roll_id)}
              >
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={dispatch.dispatch_no}
        breadcrumbs={[
          { title: <Link to="/app/dispatch">Dispatch</Link> },
          { title: dispatch.dispatch_no },
        ]}
        subtitle={`${dispatch.to_party || 'Buyer'} · Order: ${dispatch.order_no || '-'}`}
        actions={[
          <Button
            key="pdf"
            icon={<FilePdfOutlined />}
            onClick={() => downloadPackingListPdf(id, `${dispatch.dispatch_no}-packing-list.pdf`)}
          >
            Packing List PDF
          </Button>,
          !isConfirmed && can(P.DISPATCH_CONFIRM) && (
            <ConfirmButton
              key="confirm"
              title="Confirm Dispatch"
              content="Confirming locks this dispatch, updates order fulfillment, and automatically generates the buyer sales invoice."
              onConfirm={() => confirmMutation.mutate()}
            >
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={rolls.length === 0}
                loading={confirmMutation.isPending}
                style={{ background: '#006B73' }}
              >
                Confirm & Lock Dispatch
              </Button>
            </ConfirmButton>
          ),
        ].filter(Boolean)}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          {/* Status & Totals Card */}
          <SectionCard title="Dispatch Details">
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
              <Descriptions.Item label="Status">
                <StatusBadge status={dispatch.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Vehicle">{dispatch.vehicle_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="Driver">{dispatch.driver_name ? `${dispatch.driver_name} (${dispatch.driver_phone || ''})` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Rolls Packed">{dispatch.roll_count || rolls.length}</Descriptions.Item>
              <Descriptions.Item label="Total Metres">{dispatch.total_m || rolls.reduce((acc, r) => acc + Number(r.length_m || 0), 0)} m</Descriptions.Item>
              <Descriptions.Item label="Created At">{formatDateTime(dispatch.created_at)}</Descriptions.Item>
            </Descriptions>
          </SectionCard>

          {/* Scanned rolls table */}
          <SectionCard title={`Packed Rolls (${rolls.length})`} className="mt-4">
            <Table
              dataSource={rolls}
              columns={columns}
              rowKey="roll_id"
              size="small"
              pagination={{ pageSize: 15 }}
            />
          </SectionCard>
        </Col>

        <Col xs={24} lg={8}>
          {!isConfirmed ? (
            <SectionCard title="Scan Roll (Truck Loading)">
              <p style={{ color: '#536278', fontSize: 13, marginBottom: 12 }}>
                Enter the Roll Number or barcode token from the inspection sticker. Only QC-passed rolls of this order are accepted.
              </p>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  ref={inputRef}
                  placeholder="e.g. ROL-2026-0042"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onPressEnter={() => handleScan()}
                  disabled={scanMutation.isPending}
                />
                <Button
                  type="primary"
                  icon={<ScanOutlined />}
                  loading={scanMutation.isPending}
                  onClick={() => handleScan()}
                  style={{ background: '#006B73' }}
                >
                  Scan
                </Button>
              </Space.Compact>

              {failedAttempts.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Text strong style={{ color: '#B42318', fontSize: 13 }}>Recent Scan Errors</Text>
                  <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {failedAttempts.map((f) => (
                      <Alert
                        key={f.key}
                        type="error"
                        showIcon
                        message={<strong>{f.roll_no}</strong>}
                        description={f.error}
                        style={{ marginBottom: 6, padding: '4px 8px' }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          ) : (
            <SectionCard title="Shipment Locked">
              <Alert
                type="success"
                showIcon
                message="Dispatch is Confirmed"
                description="This shipment has been verified and sealed. The invoice was generated and rolls cannot be modified."
              />
            </SectionCard>
          )}
        </Col>
      </Row>
    </div>
  );
}
