import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Divider, Form, Input, Tag, message } from 'antd';
import { useSession } from '@/context/Session';
import { supabase } from '@/lib/supabase';
import { PageTitle, QueryState } from '@/components/States';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export default function Profile() {
  const session = useSession();
  const cache = useQueryClient();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const me = useQuery({ queryKey: [session.userId, 'profile'], queryFn: ({ signal }) => session.api('/me', { signal }) });
  const profile = me.data?.data;
  useEffect(() => { if (profile) form.setFieldsValue(profile); }, [profile, form]);

  const save = useMutation({
    mutationFn: (v) => session.api('/me/profile', { method: 'PUT', body: v }),
    onSuccess: () => { message.success('Profile saved'); cache.invalidateQueries({ queryKey: [session.userId] }); session.refreshAccess(); },
    onError: (e) => message.error(e.message),
  });

  async function changePassword({ password }) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { message.error(error.message); return; }
    message.success('Password changed');
    passwordForm.resetFields();
  }

  return (
    <>
      <PageTitle title="My profile" description={<>{session.context.mill.name} · <Tag color="blue">{session.context.role.name}</Tag></>} />
      <section className="panel" style={{ maxWidth: 640 }}>
        <QueryState query={me}>
          <Form
            form={form} layout="vertical" requiredMark={false}
            onFinish={(v) => save.mutate({ full_name: v.full_name, phone: v.phone, address: v.address, city: v.city || undefined, emergency_contact: v.emergency_contact || undefined })}
          >
            <Form.Item label="Email"><Input value={profile?.email} disabled /></Form.Item>
            <Form.Item name="full_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter your name' }]}><Input /></Form.Item>
            <Form.Item name="phone" label="Phone number" rules={[{ required: true, pattern: PHONE, message: 'Enter a valid phone number' }]}><Input /></Form.Item>
            <Form.Item name="address" label="Address" rules={[{ required: true, min: 3, message: 'Enter your address' }]}><Input.TextArea rows={2} /></Form.Item>
            <Form.Item name="city" label="City"><Input /></Form.Item>
            <Form.Item name="emergency_contact" label="Emergency contact (name and phone)"><Input /></Form.Item>
            <Button type="primary" htmlType="submit" loading={save.isPending}>Save profile</Button>
          </Form>

          <Divider />

          <Form form={passwordForm} layout="vertical" requiredMark={false} onFinish={changePassword}>
            <Form.Item
              name="password" label="New password"
              rules={[
                { required: true, message: 'Enter a new password' },
                { min: 8, message: 'At least 8 characters' },
                { pattern: /[A-Za-z]/, message: 'Include a letter' },
                { pattern: /[0-9]/, message: 'Include a number' },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button htmlType="submit">Change password</Button>
          </Form>
        </QueryState>
      </section>
    </>
  );
}
