import { useState } from 'react';
import { Card, Tag, Button, Typography, Modal, InputNumber, Input, Row, Col, Space, Progress, message } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ThunderboltOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMachineBoard, startWorkOrder, pauseWorkOrder, resumeWorkOrder, logProduction, finishWorkOrder, reportMachineBreakdown } from '@/features/production/api';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

export default function FloorMachinePage() {
  const qc = useQueryClient();
  const [logModal, setLogModal] = useState(null);
  const [logQty, setLogQty] = useState(20);
  const [wasteQty, setWasteQty] = useState(0);

  const [rollModal, setRollModal] = useState(null);
  const [rollLength, setRollLength] = useState(100);
  const [rollWeight, setRollWeight] = useState(25);

  const [breakdownModal, setBreakdownModal] = useState(null);
  const [breakdownReason, setBreakdownReason] = useState('');

  // Operator sees their assigned machine(s): GET /production/board?mine=true (falls back to all machines)
  const boardQ = useQuery({
    queryKey: ['production', 'board', 'mine'],
    queryFn: () => fetchMachineBoard({ mine: true }).then((r) => r.data || r),
    refetchInterval: 15_000,
  });

  const boardData = boardQ.data || {};
  let machines = Array.isArray(boardData.machines) ? boardData.machines : [];

  const startMut = useMutation({
    mutationFn: (id) => startWorkOrder(id),
    onSuccess: () => {
      message.success('Work order started');
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not start'),
  });

  const pauseMut = useMutation({
    mutationFn: ({ id, reason }) => pauseWorkOrder({ id, reason }),
    onSuccess: () => {
      message.info('Work order paused');
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not pause'),
  });

  const logMut = useMutation({
    mutationFn: ({ id, qty, uom, waste_qty }) => logProduction({ id, qty, uom, waste_qty }),
    onSuccess: () => {
      message.success('Output recorded');
      setLogModal(null);
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not record output'),
  });

  const rollMut = useMutation({
    mutationFn: (payload) => api.post('/rolls', payload),
    onSuccess: (res) => {
      const rNo = res.data?.roll_no || 'New Roll';
      message.success(`Fabric Roll ${rNo} created! Sent to QC queue.`);
      setRollModal(null);
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
      qc.invalidateQueries({ queryKey: ['qc', 'queue'] });
    },
    onError: (err) => message.error(err.message || 'Could not create roll'),
  });

  const breakdownMut = useMutation({
    mutationFn: ({ machineId, reason }) => reportMachineBreakdown({ machineId, reason }),
    onSuccess: () => {
      message.error('Machine Breakdown Reported — Maintenance alerted');
      setBreakdownModal(null);
      qc.invalidateQueries({ queryKey: ['production', 'board'] });
    },
    onError: (err) => message.error(err.message || 'Could not report breakdown'),
  });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#12233F' }}>Machine Terminal</Title>
          <Text type="secondary">Operator view — start runs, log output & cut rolls</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => boardQ.refetch()}>Refresh</Button>
      </div>

      {machines.length === 0 && !boardQ.isLoading && (
        <Card style={{ textAlign: 'center', padding: 24, borderRadius: 8 }}>
          <p style={{ color: '#536278', fontSize: 16 }}>No active machine assigned to your shift today.</p>
          <Button onClick={() => boardQ.refetch()}>Check Again</Button>
        </Card>
      )}

      {machines.map((m) => (
        <Card
          key={m.machine_id}
          style={{
            marginBottom: 16,
            borderRadius: 12,
            border: `2px solid ${m.status === 'breakdown' ? '#B42318' : m.status === 'running' ? '#18794E' : '#DCE3E9'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#12233F', marginRight: 8 }}>{m.code}</span>
              <span style={{ fontSize: 14, color: '#536278' }}>({m.stage})</span>
            </div>
            <Tag color={m.status === 'running' ? 'success' : m.status === 'breakdown' ? 'error' : 'warning'} style={{ fontSize: 14, padding: '4px 12px' }}>
              {m.status?.toUpperCase()}
            </Tag>
          </div>

          {m.wo_no ? (
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text strong>Work Order: {m.wo_no}</Text>
                <Text type="secondary">Order: {m.order_no || '-'}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>Output Today: <strong>{m.today_qty || 0} {m.uom}</strong></span>
                <span>Target: <strong>{m.target_qty || 0} {m.uom}</strong></span>
              </div>
              <Progress percent={Math.round(m.pct || 0)} />
            </div>
          ) : (
            <div style={{ padding: '12px 0', color: '#64748B', fontStyle: 'italic' }}>
              No scheduled work order on this machine.
            </div>
          )}

          {/* Action Button Bar */}
          <Row gutter={[12, 12]}>
            {m.status === 'running' && m.work_order_id && (
              <>
                <Col xs={12} sm={6}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    style={{ background: '#006B73' }}
                    onClick={() => {
                      setLogModal(m);
                      setLogQty(20);
                      setWasteQty(0);
                    }}
                  >
                    Log Output
                  </Button>
                </Col>
                <Col xs={12} sm={6}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    style={{ background: '#18794E' }}
                    onClick={() => {
                      setRollModal(m);
                      setRollLength(100);
                      setRollWeight(25);
                    }}
                  >
                    Cut Roll (QC)
                  </Button>
                </Col>
                <Col xs={12} sm={6}>
                  <Button
                    block
                    size="large"
                    icon={<PauseCircleOutlined />}
                    onClick={() => pauseMut.mutate({ id: m.work_order_id, reason: 'Operator paused' })}
                  >
                    Pause
                  </Button>
                </Col>
              </>
            )}

            {m.status !== 'running' && m.work_order_id && m.status !== 'breakdown' && (
              <Col xs={12} sm={8}>
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<PlayCircleOutlined />}
                  loading={startMut.isPending}
                  onClick={() => startMut.mutate(m.work_order_id)}
                >
                  Start Machine
                </Button>
              </Col>
            )}

            {m.status !== 'breakdown' && (
              <Col xs={12} sm={6}>
                <Button
                  danger
                  block
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={() => {
                    setBreakdownModal(m);
                    setBreakdownReason('');
                  }}
                >
                  Breakdown
                </Button>
              </Col>
            )}
          </Row>
        </Card>
      ))}

      {/* Log Output Modal */}
      <Modal
        title={`Record Production — ${logModal?.code}`}
        open={!!logModal}
        onCancel={() => setLogModal(null)}
        onOk={() =>
          logMut.mutate({
            id: logModal?.work_order_id,
            qty: Number(logQty),
            uom: logModal?.uom || 'm',
            waste_qty: Number(wasteQty || 0),
          })
        }
        confirmLoading={logMut.isPending}
        okText="Log"
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Good Output ({logModal?.uom || 'm'})</label>
          <InputNumber min={0.1} value={logQty} onChange={setLogQty} style={{ width: '100%' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Waste / Scrap ({logModal?.uom || 'm'})</label>
          <InputNumber min={0} value={wasteQty} onChange={setWasteQty} style={{ width: '100%' }} />
        </div>
      </Modal>

      {/* Cut Roll Modal */}
      <Modal
        title={`Cut & Print Roll Label — ${rollModal?.code}`}
        open={!!rollModal}
        onCancel={() => setRollModal(null)}
        onOk={() =>
          rollMut.mutate({
            work_order_id: rollModal?.work_order_id,
            length_m: Number(rollLength),
            weight_kg: Number(rollWeight || 0),
          })
        }
        confirmLoading={rollMut.isPending}
        okText="Create Roll & Send to QC"
      >
        <p style={{ color: '#536278' }}>
          Cutting a finished roll registers it in the system and automatically sends it into the QC queue for inspection.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Roll Length (m)</label>
          <InputNumber min={1} value={rollLength} onChange={setRollLength} style={{ width: '100%' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Weight (kg, optional)</label>
          <InputNumber min={0} value={rollWeight} onChange={setRollWeight} style={{ width: '100%' }} />
        </div>
      </Modal>

      {/* Breakdown Modal */}
      <Modal
        title={`Report Machine Breakdown — ${breakdownModal?.code}`}
        open={!!breakdownModal}
        onCancel={() => setBreakdownModal(null)}
        onOk={() =>
          breakdownMut.mutate({
            machineId: breakdownModal?.machine_id,
            reason: breakdownReason || 'Operator reported breakdown',
          })
        }
        confirmLoading={breakdownMut.isPending}
        okText="Report Breakdown"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: '#536278' }}>Describe the breakdown symptom or problem:</p>
        <Input.TextArea
          rows={3}
          placeholder="e.g. Broken loom shuttle, oil leak, needle bend"
          value={breakdownReason}
          onChange={(e) => setBreakdownReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
