import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { supabase } from '@/lib/supabase';
import '@/styles/login.css';

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

export default function Login({ initialError }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  async function submit(values) {
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.signInWithPassword(values);
      if (result.error) throw result.error;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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

              <Form layout="vertical" onFinish={submit} requiredMark={false}>
                <Form.Item
                  name="email"
                  label={<span className="form-label-title">Email address</span>}
                  rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}
                  style={{ marginBottom: 16 }}
                >
                  <Input
                    size="large"
                    prefix={<MailIcon />}
                    placeholder="admin@dayflow.local"
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
                  <a href="#forgot" className="forgot-link-text" onClick={e => e.preventDefault()}>
                    Forgot password?
                  </a>
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
                <div className="metric-highlight-value">24</div>
                <div className="metric-footer-part">
                  <span className="metric-sub-detail">Active lines</span>
                  <span className="metric-positive-trend">↑ +12%</span>
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
                <div className="metric-highlight-value">428</div>
                <div className="metric-footer-part">
                  <span className="metric-sub-detail">SKUs in stock</span>
                  <span className="metric-positive-trend">↑ +8%</span>
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
                <div className="metric-highlight-value">36</div>
                <div className="metric-footer-part">
                  <span className="metric-sub-detail">Open orders</span>
                  <span className="metric-positive-trend">↑ +17%</span>
                </div>
              </div>
            </div>

            {/* Tablet Mockup with Dashboard Preview */}
            <div className="tablet-preview-stage">
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

                      <div className="tablet-graphs-row">
                        <div className="mini-chart-card">
                          <svg className="spline-chart" viewBox="0 0 160 55" preserveAspectRatio="none">
                            <path d="M0,38 C30,15 50,45 80,20 C110,-2 130,35 160,12" fill="none" stroke="#34d399" strokeWidth="2" />
                            <path d="M0,45 C35,32 60,50 95,38 C125,25 140,42 160,28" fill="none" stroke="#d0af71" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.85" />
                          </svg>
                        </div>
                        <div className="mini-chart-card">
                          <svg className="spline-chart" viewBox="0 0 160 55" preserveAspectRatio="none">
                            <path d="M0,30 C35,48 70,12 105,35 C135,55 145,18 160,25" fill="none" stroke="#38bdf8" strokeWidth="2" />
                            <path d="M0,42 C40,25 70,38 110,18 C140,32 150,15 160,20" fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.8" />
                          </svg>
                        </div>
                      </div>

                      <div className="tablet-progress-trio">
                        <div className="progress-unit-item">
                          <div className="progress-unit-labels">
                            <span>Rolling</span>
                            <strong>78%</strong>
                          </div>
                          <div className="progress-track-rail">
                            <div className="progress-fill-bar" style={{ width: '78%', background: '#34d399' }} />
                          </div>
                        </div>

                        <div className="progress-unit-item">
                          <div className="progress-unit-labels">
                            <span>Weaving</span>
                            <strong>62%</strong>
                          </div>
                          <div className="progress-track-rail">
                            <div className="progress-fill-bar" style={{ width: '62%', background: '#38bdf8' }} />
                          </div>
                        </div>

                        <div className="progress-unit-item">
                          <div className="progress-unit-labels">
                            <span>Processing</span>
                            <strong>91%</strong>
                          </div>
                          <div className="progress-track-rail">
                            <div className="progress-fill-bar" style={{ width: '91%', background: '#d0af71' }} />
                          </div>
                        </div>
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
