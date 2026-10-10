import { Row, Col, Typography, Button, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import AttendanceTodayPage from '@/features/workforce/pages/AttendanceTodayPage';
import AssignmentsPage from '@/features/production/pages/AssignmentsPage';

const { Title, Text } = Typography;

export default function FloorSuperPage() {
  return (
    <div style={{ padding: '16px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, color: '#12233F' }}>Supervisor Floor Dashboard</Title>
        <Text type="secondary">Shift management: Worker attendance, machine assignments & floor alerts</Text>
      </div>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <AttendanceTodayPage />
        <AssignmentsPage />
      </Space>
    </div>
  );
}
