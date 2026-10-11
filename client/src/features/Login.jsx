// Login page: email and password sign-in beside a live preview of the mill's numbers (from /public/mill-stats).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { request } from '@/lib/api';
import '@/styles/login.css';
import { usePageTitle } from '@/lib/title';

/* Symmetrical woven lattice logo icon */
function LogoWeaveIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 14L22 29M14 7L29 22" stroke="#d0af71" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 29L29 14M7 22L22 7" stroke="#c4a161" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 11L25 25M11 25L25 11" stroke="#d9bd85" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2.5" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2.5" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function YarnSpoolIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d0af71" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

function BoxInventoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d0af71" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function OrdersDocumentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d0af71" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

// The preview on the right shows the mill's real numbers (GET /public/mill-stats: counts only, no login needed).
const STAGE_COLOURS = ['#34d399', '#38bdf8', '#d0af71', '#a78bfa'];

/** a smooth line through the values, scaled to a w×h box (each series on its own scale) */
function linePath(values, w, h) {
  const max = Math.max(...values, 1);
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [i * step, h - 4 - (v / max) * (h - 8)]);
  return pts.map(([x, y], i) => {
    if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
    const [px, py] = pts[i - 1];
    const mx = ((px + x) / 2).toFixed(1);
    return `C${mx},${py.toFixed(1)} ${mx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function ChangePill({ pct }) {
  if (pct == null) return null;
  return <span className={pct >= 0 ? 'metric-positive-trend' : 'metric-negative-trend'}>{pct >= 0 ? '↑ +' : '↓ '}{pct}%</span>;
}

function MiniChart({ lines, colours }) {
  return (
    <div className="mini-chart-card">
      <svg className="spline-chart" viewBox="0 0 160 55" preserveAspectRatio="none" role="img" aria-label={lines.map((l) => l.label).join(' and ')}>
        {lines.map((l, i) => (
          <path key={l.label} d={linePath(l.values, 160, 55)} fill="none" stroke={colours[i]} strokeWidth={i ? 1.5 : 2} strokeDasharray={i ? '3 2' : undefined} opacity={i ? 0.85 : 1} />
        ))}
      </svg>
    </div>
  );
}

export default function Login({ initialError }) {
  usePageTitle('Sign in');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [form] = Form.useForm();
  const { data: stats } = useQuery({ queryKey: ['mill-stats'], queryFn: ({ signal }) => request('/public/mill-stats', { signal }).then((r) => r.data), retry: false, staleTime: 60000 });

  async function submit(values) {
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.signInWithPassword(values);
      if (result.error) throw result.error;
      navigate('/', { replace: true });   // a fresh login always lands on the dashboard (or the floor screen for shop-floor roles), whatever page was open
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setResetSent(false);
    try {
      const { email } = await form.validateFields(['email']);
      setResetting(true);
      const redirectTo = import.meta.env.VITE_PASSWORD_RESET_URL || `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err) {
      if (err?.errorFields) return;
      setError(err.message || 'Could not send the password reset email.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="login-view-root">
      {/* 1. Clean Top Navigation Bar */}
      <header className="login-navbar">
        <div className="login-nav-left">
          <div className="nav-brand-logo">
            <LogoWeaveIcon size={30} />
          </div>
          <span className="nav-brand-text">sameta</span>
        </div>
        <div className="login-nav-right">
          <span className="nav-platform-tag">Textile Operations Platform</span>
        </div>
      </header>

      {/* 2. Main Hero Stage */}
      <main className="login-stage">
        <div className="login-stage-backdrop" />

        <div className="login-container">
          {/* Left Column: Floating Sign-In Card */}
          <div className="login-card-container">
            <section className="login-floating-card">
              <div className="card-eyebrow">WELCOME BACK</div>
              <h1 className="card-main-title">
                Sign in to your<br />workspace
              </h1>
              <p className="card-intro-text">
                Use your team&apos;s registered account to access sameta and keep your operations moving.
              </p>

              {error && (
                <Alert
                  className="mb-4"
                  type="error"
                  showIcon
                  message={error}
                  closable
                  onClose={() => setError(null)}
                />
              )}

              {resetSent && <Alert className="mb-4" type="success" showIcon message="Password reset email sent" description="Open the link in that email to choose a new password." />}

              <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
                <Form.Item
                  name="email"
                  label={<span className="form-label-title">Email address</span>}
                  rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}
                  style={{ marginBottom: 16 }}
                >
                  <Input
                    size="large"
                    prefix={<MailIcon />}
                    placeholder="you@yourmill.com"
                    autoComplete="username"
                    className="form-input-pill"
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  label={<span className="form-label-title">Password</span>}
                  rules={[{ required: true, message: 'Enter your password.' }]}
                  style={{ marginBottom: 4 }}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockIcon />}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="form-input-pill"
                  />
                </Form.Item>

                <div className="forgot-password-link-wrapper">
                  <button type="button" className="forgot-link-text" onClick={resetPassword} disabled={resetting}>
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  loading={busy}
                  block
                  className="btn-login-submit"
                >
                  Sign in &nbsp;→
                </Button>

                <div className="trust-badge-footer">
                  <ShieldCheckIcon />
                  <span>Secure access to your team&apos;s workspace</span>
                </div>
              </Form>

            </section>
          </div>

          {/* Right Column: Hero Headline, 3 Glass Cards, Tablet Preview */}
          <section className="login-hero-stage">
            <div className="hero-tag-connected">EVERY THREAD. CONNECTED.</div>
            <h2 className="hero-statement-title">
              A clearer view<br />
              of your <span className="gold-word">mill.</span>
            </h2>
            <p className="hero-narrative-copy">
              From the first yarn receipt to the last finished roll. Keep your people, production and orders moving together.
            </p>

            {/* 3 Frosted Glass Metric Cards */}
            <div className="glass-metrics-row">
              {/* Card 1: Production */}
              <div className="glass-metric-box">
                <div className="metric-header-part">
                  <div className="metric-icon-circle">
                    <YarnSpoolIcon />
                  </div>
                  <span className="metric-label-title">Production</span>
                </div>
                <div className="metric-highlight-value">{stats ? stats.active_lines : '–'}</div>
                <div className="metric-footer-part">
                  <span className="metric-sub-detail">Machines running</span>
                  <ChangePill pct={stats?.output_change_pct} />
                </div>
              </div>

              {/* Card 2: Inventory */}
              <div className="glass-metric-box">
                <div className="metric-header-part">
                  <div className="metric-icon-circle">
                    <BoxInventoryIcon />
                  </div>
                  <span className="metric-label-title">Inventory</span>
                </div>
                <div className="metric-highlight-value">{stats ? stats.skus_in_stock : '–'}</div>
                <div className="metric-footer-part">
                  <span className="metric-sub-detail">Items in stock</span>
                  {stats?.low_stock > 0 && <span className="metric-negative-trend">{stats.low_stock} low</span>}
                </div>
              </div>

              {/* Card 3: Orders */}
              <div className="glass-metric-box">
                <div className="metric-header-part">
                  <div className="metric-icon-circle">
                    <OrdersDocumentIcon />
                  </div>
                  <span className="metric-label-title">Orders</span>
                </div>
                <div className="metric-highlight-value">{stats ? stats.open_orders : '–'}</div>
                <div className="metric-footer-part">
                  <span className="metric-sub-detail">Open orders</span>
                  <ChangePill pct={stats?.orders_change_pct} />
                </div>
              </div>
            </div>

            {/* Tablet Mockup with Dashboard Preview */}
            <div className="tablet-preview-stage" aria-label="Illustrative Sameta workspace preview">
              <div className="preview-caption">Illustrative workspace preview</div>
              <div className="tablet-bezel">
                <div className="tablet-display-surface">
                  <div className="tablet-inner-nav">
                    <div className="tablet-inner-brand">
                      <LogoWeaveIcon size={14} />
                      <span>sameta</span>
                    </div>
                    <div className="tablet-inner-search">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                      <span>Dashboard</span>
                    </div>
                  </div>

                  <div className="tablet-inner-layout">
                    {/* Tablet Sidebar */}
                    <div className="tablet-sidebar-pane">
                      <div className="tablet-nav-link active">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                        </svg>
                        <span>Dashboard</span>
                      </div>
                      <div className="tablet-nav-link">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                        </svg>
                        <span>Production</span>
                      </div>
                      <div className="tablet-nav-link">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span>Orders</span>
                      </div>
                      <div className="tablet-nav-link">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m7.5 4.27 9 5.15" />
                          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                        </svg>
                        <span>Inventory</span>
                      </div>
                      <div className="tablet-nav-link">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                        <span>People</span>
                      </div>
                    </div>

                    {/* Tablet Main Chart Area */}
                    <div className="tablet-content-pane">
                      <div className="tablet-pane-header">
                        <h4>Production Overview</h4>
                      </div>

                      {stats && (
                        <div className="tablet-graphs-row">
                          <MiniChart lines={stats.series.slice(0, 2)} colours={STAGE_COLOURS.slice(0, 2)} />
                          <MiniChart lines={stats.series.slice(2, 4)} colours={STAGE_COLOURS.slice(2, 4)} />
                        </div>
                      )}

                      <div className="tablet-progress-trio">
                        {(stats?.stages ?? []).map((st, i) => (
                          <div key={st.name} className="progress-unit-item" title={`${st.running} of ${st.total} machines running`}>
                            <div className="progress-unit-labels">
                              <span>{st.name}</span>
                              <strong>{st.pct}%</strong>
                            </div>
                            <div className="progress-track-rail">
                              <div className="progress-fill-bar" style={{ width: `${st.pct}%`, background: STAGE_COLOURS[i] }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
