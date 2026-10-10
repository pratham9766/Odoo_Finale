import { Tag } from 'antd';
import { statusOf } from '@/lib/status';

export default function StatusBadge({ status }) {
  const { color, label } = statusOf(status);
  return <Tag color={color}>{label}</Tag>;
}
