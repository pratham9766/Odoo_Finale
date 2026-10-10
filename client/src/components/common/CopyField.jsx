import { Button, message, Typography, Space } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Text } = Typography;

export default function CopyField({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Could not copy to clipboard');
    }
  };

  return (
    <Space>
      {label && <Text type="secondary" style={{ fontSize: 13 }}>{label}:</Text>}
      <Text
        code
        style={{ fontSize: 13, background: '#F4F6F8', border: '1px solid #DCE3E9', borderRadius: 4, padding: '2px 8px' }}
      >
        {value}
      </Text>
      <Button
        size="small"
        type="text"
        icon={copied ? <CheckOutlined style={{ color: '#18794E' }} /> : <CopyOutlined />}
        onClick={handleCopy}
        aria-label={`Copy ${label ?? 'value'}`}
      />
    </Space>
  );
}
