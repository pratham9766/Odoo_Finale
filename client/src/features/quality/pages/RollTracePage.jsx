import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Descriptions, Timeline, Tag, Card, Alert, Skeleton, Button, Table, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { PageHeader, SectionCard, StatusBadge } from '@/components/common';
import { fetchRollTrace } from '../api';
import { formatDateTime } from '@/lib/format';

const { Title, Text } = Typography;

export default function RollTracePage() {
  const { rollNo } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['rolls', rollNo, 'trace'],
    queryFn: ({ signal }) => fetchRollTrace({ rollNo, signal }),
    enabled: !!rollNo,
  });

  const trace = data?.data || data;
  const roll = trace?.roll;
  const events = trace?.timeline || [];
  const rawLots = trace?.raw_material_lots || [];
  const inspections = trace?.inspections || [];
  const dispatchInfo = trace?.dispatch;

  if (isLoading) {
    return (
      <div>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !roll) {
    return (
      <div>
        <Alert
          type="error"
          message="Roll not found"
          description={`Could not trace roll "${rollNo}".`}
          action={<Button onClick={() => navigate('/app/quality')}>Back to Quality</Button>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Roll Trace — ${roll.roll_no}`}
        breadcrumbs={[
          { title: <Link to="/app/quality">Quality</Link> },
          { title: roll.roll_no },
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <SectionCard title="Roll Summary">
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
              <Descriptions.Item label="Roll No">{roll.roll_no}</Descriptions.Item>
              <Descriptions.Item label="Order No">
                {roll.order_id ? <Link to={`/app/orders/${roll.order_id}`}>{roll.order_no || 'View order'}</Link> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <StatusBadge status={roll.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Length">{roll.length_m} m</Descriptions.Item>
              <Descriptions.Item label="Weight">{roll.weight_kg ? `${roll.weight_kg} kg` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Dye Batch">{roll.dye_batch || '-'}</Descriptions.Item>
              <Descriptions.Item label="Item">{roll.item_name || 'Finished Fabric'}</Descriptions.Item>
              <Descriptions.Item label="Created">{formatDateTime(roll.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Dispatch">
                {dispatchInfo ? (
                  <Link to={`/app/dispatch/${dispatchInfo.dispatch_no}`}>{dispatchInfo.dispatch_no} ({dispatchInfo.status})</Link>
                ) : (
                  <Tag>In Mill</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
          </SectionCard>

          <SectionCard title="Genealogy (Raw Material Lots)" className="mt-4">
            <Table
              dataSource={rawLots}
              rowKey="lot_no"
              size="small"
              pagination={false}
              columns={[
                { title: 'Lot No.', dataIndex: 'lot_no', key: 'lot_no', render: (v) => <strong>{v}</strong> },
                { title: 'Material', dataIndex: 'item', key: 'item' },
                { title: 'Supplier', dataIndex: 'supplier', key: 'supplier', render: (v) => v || 'Direct' },
                { title: 'Dye Batch', dataIndex: 'dye_batch', key: 'dye_batch', render: (v) => v || '-' },
              ]}
            />
          </SectionCard>

          <SectionCard title="QC Inspections" className="mt-4">
            <Table
              dataSource={inspections}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                {
                  title: 'Result',
                  dataIndex: 'result',
                  key: 'result',
                  render: (v) => (
                    <Tag color={v === 'pass' ? 'success' : v === 'rework' ? 'warning' : 'error'}>
                      {v?.toUpperCase()}
                    </Tag>
                  ),
                },
                { title: 'Inspector', dataIndex: 'inspector', key: 'inspector' },
                { title: 'Date', dataIndex: 'inspected_at', key: 'inspected_at', render: (v) => formatDateTime(v) },
                { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v) => v || '-' },
                {
                  title: 'Defects',
                  key: 'defects',
                  render: (_, r) => (
                    <div>
                      {r.defects?.length > 0
                        ? r.defects.map((d, i) => (
                            <Tag key={i} color="red">{d.defect} ({d.count})</Tag>
                          ))
                        : 'None'}
                    </div>
                  ),
                },
              ]}
            />
          </SectionCard>
        </Col>

        <Col xs={24} lg={8}>
          <SectionCard title="Production Timeline">
            <Timeline
              style={{ marginTop: 12 }}
              items={events.map((e) => ({
                color: e.event === 'rejected' ? 'red' : e.event === 'passed' ? 'green' : 'blue',
                children: (
                  <div>
                    <div style={{ fontWeight: 600, color: '#12233F' }}>
                      {e.event?.toUpperCase()} {e.stage ? `· ${e.stage}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#536278' }}>
                      {e.machine ? `Machine ${e.machine}` : ''} {e.worker ? `(${e.worker})` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>{formatDateTime(e.at)}</div>
                  </div>
                ),
              }))}
            />
          </SectionCard>
        </Col>
      </Row>
    </div>
  );
}
