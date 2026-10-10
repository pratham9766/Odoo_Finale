import { useState } from 'react';
import { Badge, Button, Empty, List, Popover } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAction, useGet } from '@/lib/hooks';

const where = (link) => (!link ? null : /^\/(app|floor)\b/.test(link) ? link : `/app${link.startsWith('/') ? '' : '/'}${link}`);

/** the bell in the top bar: low stock, breakdowns, late orders ... newest first, unread in bold */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const act = useAction();
  const list = useGet('/notifications', { limit: 15 }, { refetchInterval: 30000 });
  const rows = list.payload || [];
  const unread = list.meta?.unread ?? 0;

  const openOne = (n) => {
    if (!n.read) act.mutate({ path: `/notifications/${n.id}/read` });
    setOpen(false);
    const to = where(n.link);
    if (to) navigate(to);
  };

  const content = (
    <div style={{ width: 340 }}>
      {rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications" /> : (
        <List size="small" dataSource={rows} style={{ maxHeight: 380, overflow: 'auto' }}
          renderItem={(n) => (
            <List.Item onClick={() => openOne(n)} style={{ cursor: 'pointer' }}>
              <List.Item.Meta title={<span style={{ fontWeight: n.read ? 400 : 700 }}>{n.title}</span>} description={<>{n.body}<div style={{ fontSize: 11 }}>{new Date(n.created_at).toLocaleString('en-IN')}</div></>} />
            </List.Item>
          )} />
      )}
      {unread > 0 && <Button size="small" block style={{ marginTop: 8 }} onClick={() => act.mutate({ path: '/notifications/read-all' })}>Mark all as read</Button>}
    </div>
  );

  return (
    <Popover content={content} title="Notifications" trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight">
      <button type="button" aria-label="Notifications" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: '#4b5563' }}>
        <Badge count={unread} size="small" overflowCount={99}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </Badge>
      </button>
    </Popover>
  );
}
