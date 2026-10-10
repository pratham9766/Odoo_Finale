import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Typography } from 'antd';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/home', { replace: true });
      else navigate('/login?error=callback_failed', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen flex-col gap-4">
      <Spin size="large" />
      <Typography.Text type="secondary">Verifying your account…</Typography.Text>
    </div>
  );
}
