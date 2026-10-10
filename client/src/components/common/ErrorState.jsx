import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

export default function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <Result
      status="error"
      title={title}
      subTitle={message ?? 'An unexpected error occurred. Please try again.'}
      extra={
        onRetry && (
          <Button icon={<ReloadOutlined />} onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  );
}
