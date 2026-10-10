import { useEffect } from 'react';
import { Form, Input, Button, Card, Divider, Tag, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/common';
import { useMill } from '@/hooks/useMill';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export default function ProfilePage() {
  const qc = useQueryClient();
  const { role, mill } = useMill();
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();

  const meQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => api.get('/me').then((r) => r.data) });
  useEffect(() => { if (meQ.data) form.setFieldsValue(meQ.data); }, [meQ.data, form]);

  const save = useMutation({
    mutationFn: (v) => api.put('/me/profile', v),
    onSuccess: () => {
      message.success('Profile saved');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => message.error(e.message || 'Could not save'),
  });

  const changePassword = async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return message.error(error.message);
    message.success('Password changed');
    pwForm.resetFields();
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader
        title="My profile"
        subtitle={<span>{mill?.name} · <Tag color="blue">{role?.name}</Tag></span>}
      />

      <Card loading={meQ.isLoading}>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => save.mutate({
          full_name: v.full_name, phone: v.phone, address: v.address, city: v.city || undefined, emergency_contact: v.emergency_contact || undefined,
        })}>
          <Form.Item label="Email"><Input value={meQ.data?.email} disabled /></Form.Item>
          <Form.Item name="full_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter your name' }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone number" rules={[{ required: true, pattern: PHONE, message: 'Enter a valid phone number' }]}><Input /></Form.Item>
          <Form.Item name="address" label="Address" rules={[{ required: true, min: 3, message: 'Enter your address' }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="city" label="City"><Input /></Form.Item>
          <Form.Item name="emergency_contact" label="Emergency contact (name and phone)"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending}>Save profile</Button>
        </Form>

        <Divider />

        <Form form={pwForm} layout="vertical" requiredMark={false} onFinish={changePassword}>
          <Form.Item
            name="password"
            label="New password"
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
      </Card>
    </div>
  );
}
