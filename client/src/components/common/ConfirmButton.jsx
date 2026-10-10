import { Button, Popconfirm } from 'antd';

export default function ConfirmButton({ title, description, onConfirm, danger = false, children, disabled, loading, type = 'default' }) {
  return (
    <Popconfirm
      title={title}
      description={description}
      onConfirm={onConfirm}
      okText="Yes, proceed"
      cancelText="Cancel"
      okButtonProps={{ danger }}
      disabled={disabled}
    >
      <Button type={type} danger={danger} disabled={disabled} loading={loading}>
        {children}
      </Button>
    </Popconfirm>
  );
}
