import { Breadcrumb, Button, Space, Typography } from 'antd';

const { Title, Text } = Typography;

export default function PageHeader({ title, subtitle, breadcrumbs = [], actions, children }) {
  return (
    <div className="mb-6">
      {breadcrumbs.length > 0 && (
        <Breadcrumb
          items={breadcrumbs}
          className="mb-2"
          style={{ fontSize: 13 }}
        />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level={4} style={{ margin: 0, color: '#12233F', fontSize: 24 }}>
            {title}
          </Title>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: 14, marginTop: 2, display: 'block' }}>
              {subtitle}
            </Text>
          )}
        </div>
        {actions && <Space wrap>{actions}</Space>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
