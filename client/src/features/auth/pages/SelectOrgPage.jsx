import { List, Card, Button, Typography, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/hooks/useOrg';
import { homeFor } from '@/config/portals';
import { ApartmentOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function SelectOrgPage() {
  const { orgs, switchOrg, org } = useOrg();
  const navigate = useNavigate();

  const select = async (id) => {
    await switchOrg(id);
    const selected = orgs.find(o => o.id === id);
    navigate(homeFor(selected, null, new Set()), { replace: true });
  };

  return (
    <div>
      <Title level={3} style={{ color: '#12233F', marginBottom: 4 }}>
        Select workspace
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        You have access to multiple organizations.
      </Text>
      <List
        dataSource={orgs}
        renderItem={o => (
          <List.Item className="px-0">
            <Card
              hoverable
              className="w-full cursor-pointer"
              style={{ border: o.id === org?.id ? '2px solid #006B73' : '1px solid #DCE3E9' }}
              onClick={() => select(o.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-appbg flex items-center justify-center flex-shrink-0">
                  <ApartmentOutlined style={{ fontSize: 20, color: '#006B73' }} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-strong truncate">{o.name}</div>
                  <div className="text-secondary text-xs mt-0.5">
                    {o.types?.map(t => <Tag key={t} size="small">{t}</Tag>)}
                    {o.city && <span className="ml-1">{o.city}</span>}
                  </div>
                </div>
                {o.id === org?.id && <Tag color="success" className="ml-auto flex-shrink-0">Current</Tag>}
              </div>
            </Card>
          </List.Item>
        )}
      />
    </div>
  );
}
