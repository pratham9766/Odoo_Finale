import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

export default function EmptyState({ title = 'Nothing here yet', description, action, actionLabel = 'Add first item', onAction }) {
  return (
    <Result
      status="info"
      title={title}
      subTitle={description}
      extra={
        action
          ? action
          : onAction
          ? <Button type="primary" onClick={onAction}>{actionLabel}</Button>
          : null
      }
    />
  );
}
