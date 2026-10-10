import { Card } from 'antd';

export default function SectionCard({ title, extra, children, className, bodyStyle, noPad }) {
  return (
    <Card
      className={`tl-card ${className ?? ''}`}
      title={title ? <span style={{ fontSize: 15, fontWeight: 600, color: '#12233F' }}>{title}</span> : null}
      extra={extra}
      styles={{ body: noPad ? { padding: 0 } : (bodyStyle ?? { padding: 20 }) }}
      style={{ marginBottom: 16, border: '1px solid #DCE3E9', borderRadius: 8 }}
    >
      {children}
    </Card>
  );
}
