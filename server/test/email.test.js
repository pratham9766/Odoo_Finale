import { test } from 'node:test';
import assert from 'node:assert/strict';

// config/env.js validates process.env at import time, so fill the required keys first
Object.assign(process.env, {
  CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://test',
  AI_DATABASE_URL: process.env.AI_DATABASE_URL ?? 'postgres://test',
  PUBLIC_TRACK_BASE_URL: process.env.PUBLIC_TRACK_BASE_URL ?? 'http://localhost:5173/track',
});
const { env } = await import('../src/config/env.js');
const email = await import('../src/utils/email.js');

env.RESEND_API_KEY = undefined;          // never hit the real API from tests, even if .env has a key

const samples = {
  staff_invite: { org_name: 'Everest Textiles', role_name: 'Shift Supervisor', inviter_name: 'Ravi', token: 'tok_abc/123' },
  partner_invite: { requester_name: 'Everest Textiles', relation: 'supplier', token: 'ptok' },
  order_status: { order_no: 'ORD-2026-0017', mill_name: 'Everest Textiles', status: 'ready_to_ship', tracking_url: 'http://localhost:5173/track/xyz' },
  delivery_otp: { otp: '4821', dispatch_no: 'DSP-2026-0009', mill_name: 'Everest Textiles', vehicle_no: 'MH04 AB 1234', driver_name: 'Ramesh' },
  overdue_reminder: { invoice_no: 'INV-2026-0042', seller_name: 'Everest Textiles', amount_due: 125000.5, due_date: '2026-09-30', days_overdue: 10 },
};

test('every template renders subject, html and text', () => {
  assert.deepEqual(Object.keys(samples).sort(), [...email.TEMPLATE_NAMES].sort());
  for (const [name, data] of Object.entries(samples)) {
    const m = email.render(name, data);
    assert.ok(m.subject.length > 5, name);
    assert.match(m.html, /^<!doctype html>/, name);
    assert.ok(m.text.length > 20, name);
  }
});

test('templates carry the important details', () => {
  const invite = email.render('staff_invite', samples.staff_invite);
  assert.match(invite.text, /Ravi invited you to join Everest Textiles as Shift Supervisor/);
  assert.match(invite.text, /http:\/\/localhost:5173\/invite\/staff\/tok_abc%2F123/);   // token is URL-encoded

  assert.match(email.render('partner_invite', samples.partner_invite).text, /as their supplier/);
  assert.match(email.render('order_status', samples.order_status).subject, /ORD-2026-0017 is ready to ship/);

  const otp = email.render('delivery_otp', samples.delivery_otp);
  assert.match(otp.text, /\n\n4821$/);
  assert.match(otp.text, /Vehicle MH04 AB 1234, driver Ramesh/);

  const overdue = email.render('overdue_reminder', samples.overdue_reminder);
  assert.match(overdue.text, /₹1,25,000\.50 was due on 30 Sept? 2026 \(10 days ago\)/);
});

test('names are HTML-escaped', () => {
  const m = email.render('staff_invite', { ...samples.staff_invite, org_name: '<script>alert(1)</script> & Co' });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'));
});

test('programming errors throw', async () => {
  assert.throws(() => email.render('nope', {}), /unknown template/);
  assert.throws(() => email.render('delivery_otp', { dispatch_no: 'D1', mill_name: 'M' }), /missing otp/);
  await assert.rejects(email.send({ to: [], template: 'delivery_otp', data: samples.delivery_otp }), /no recipient/);
});

test('without RESEND_API_KEY in development the email is printed, not sent', async (t) => {
  const info = t.mock.method(console, 'info', () => {});
  env.NODE_ENV = 'development';
  const r = await email.send({ to: 'buyer@urban.demo', template: 'delivery_otp', data: samples.delivery_otp });
  assert.deepEqual(r, { sent: false, logged: true });
  assert.equal(info.mock.callCount(), 1);
  assert.match(info.mock.calls[0].arguments[0], /to: buyer@urban\.demo[\s\S]*4821/);
});

test('without RESEND_API_KEY in production the body (OTP) is never logged', async (t) => {
  const info = t.mock.method(console, 'info', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  env.NODE_ENV = 'production';
  try {
    const r = await email.send({ to: 'buyer@urban.demo', template: 'delivery_otp', data: samples.delivery_otp });
    assert.deepEqual(r, { sent: false, logged: false });
    assert.equal(info.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 1);
    assert.ok(!warn.mock.calls[0].arguments[0].includes('4821'));
  } finally {
    env.NODE_ENV = 'test';
  }
});
