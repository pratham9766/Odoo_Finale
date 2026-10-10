// Transactional email through Resend (backend plan §16).
//
//   import * as email from '../utils/email.js';
//   await email.send({ to: 'gm@everest.demo', template: 'staff_invite',
//                      data: { org_name: 'Everest', role_name: 'GM', token } });
//
// Without RESEND_API_KEY the email is printed to the console instead, so invites and OTPs still
// work locally. In production the body is never printed (it carries OTPs and invite tokens).
//
// send() does not throw for delivery problems: it logs and resolves { sent: false, error },
// because emails are usually sent after the DB commit and must not fail the request.
// It does throw for programming errors: unknown template, missing data field, no recipient.

import { env } from '../config/env.js';
import { formatINR } from './money.js';
import { formatDate } from './time.js';

const appUrl = (path) => `${env.CLIENT_URL.replace(/\/+$/, '')}${path}`;

const RELATION = { buyer: 'buyer', supplier: 'supplier', transporter: 'transporter' };
const ORDER_STATUS = {
  confirmed: 'confirmed',
  material_ready: 'material ready, production will start soon',
  in_production: 'in production',
  in_qc: 'in quality check',
  ready_to_ship: 'ready to ship',
  partially_dispatched: 'partly dispatched',
  dispatched: 'dispatched',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

// Each template turns `data` into plain-text parts; layout() escapes them for HTML.
const TEMPLATES = {
  staff_invite: {
    required: ['org_name', 'role_name', 'token'],
    build: (d) => ({
      subject: `You're invited to join ${d.org_name} on TexLink`,
      heading: `Join ${d.org_name}`,
      lines: [
        `${d.inviter_name ?? 'Your team'} invited you to join ${d.org_name} as ${d.role_name}.`,
        'Sign in or create an account with this email address to accept. The link expires in 7 days.',
      ],
      button: { label: 'Accept invite', url: appUrl(`/invite/staff/${encodeURIComponent(d.token)}`) },
    }),
  },

  partner_invite: {
    // relation = what the invited business is to the requester (backend plan §5.3)
    required: ['requester_name', 'relation', 'token'],
    build: (d) => ({
      subject: `${d.requester_name} wants to connect with you on TexLink`,
      heading: 'New business connection',
      lines: [
        `${d.requester_name} invited your business to connect as their ${RELATION[d.relation] ?? 'partner'}.`,
        'Once connected you can exchange orders, purchase orders, dispatches and invoices directly.',
      ],
      button: { label: 'View invitation', url: appUrl(`/invite/partner/${encodeURIComponent(d.token)}`) },
    }),
  },

  order_status: {
    required: ['order_no', 'mill_name', 'status'],
    build: (d) => {
      const status = ORDER_STATUS[d.status] ?? d.status.replace(/_/g, ' ');
      return {
        subject: `Order ${d.order_no} is ${status}`,
        heading: `Order ${d.order_no}`,
        lines: [`Your order ${d.order_no} with ${d.mill_name} is now ${status}.`],
        button: d.tracking_url ? { label: 'Track order', url: d.tracking_url } : null,
      };
    },
  },

  delivery_otp: {
    required: ['otp', 'dispatch_no', 'mill_name'],
    build: (d) => ({
      subject: `Delivery ${d.dispatch_no} is on the way: your OTP`,
      heading: 'Delivery on the way',
      lines: [
        `Dispatch ${d.dispatch_no} from ${d.mill_name} is on its way to you.`,
        [d.vehicle_no && `Vehicle ${d.vehicle_no}`, d.driver_name && `driver ${d.driver_name}`, d.driver_phone]
          .filter(Boolean).join(', '),
        'Give this code to the driver only after you have received and checked the goods:',
      ].filter(Boolean),
      code: String(d.otp),
    }),
  },

  overdue_reminder: {
    required: ['invoice_no', 'seller_name', 'amount_due', 'due_date'],
    build: (d) => ({
      subject: `Payment reminder: invoice ${d.invoice_no} is overdue`,
      heading: 'Payment reminder',
      lines: [
        `Invoice ${d.invoice_no} from ${d.seller_name} for ${formatINR(d.amount_due)} was due on ` +
          `${formatDate(d.due_date)}${d.days_overdue ? ` (${d.days_overdue} days ago)` : ''}.`,
        'Please arrange payment, or ignore this email if you have already paid.',
      ],
    }),
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout({ heading, lines, button, code }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px">
<tr><td style="padding:20px 24px;background:#1f3b57;border-radius:8px 8px 0 0;color:#ffffff;font-size:18px;font-weight:bold">TexLink</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join('\n')}
${code ? `<p style="margin:16px 0;font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center">${esc(code)}</p>` : ''}
${button ? `<p style="margin:20px 0 8px"><a href="${esc(button.url)}" style="display:inline-block;padding:12px 20px;background:#1f3b57;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">${esc(button.label)}</a></p>
<p style="margin:0;font-size:12px;color:#616e7c">Or open: ${esc(button.url)}</p>` : ''}
</td></tr></table>
<p style="font-size:12px;color:#9aa5b1">You received this email because of activity on TexLink.</p>
</td></tr></table></body></html>`;

  const text = [heading, '', ...lines, ...(code ? ['', code] : []), ...(button ? ['', `${button.label}: ${button.url}`] : [])]
    .join('\n');
  return { html, text };
}

/** Build { subject, html, text } without sending (also handy for previews). */
export function render(template, data = {}) {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`email: unknown template "${template}" (known: ${TEMPLATE_NAMES.join(', ')})`);
  const missing = t.required.filter((k) => data[k] === undefined || data[k] === null || data[k] === '');
  if (missing.length) throw new Error(`email: template "${template}" is missing ${missing.join(', ')}`);
  const parts = t.build(data);
  return { subject: parts.subject, ...layout(parts) };
}

let resend;
async function client() {
  if (!resend) {
    const { Resend } = await import('resend');      // loaded only when a key is configured
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * @param {{ to: string|string[], template: string, data?: object }} msg
 * @returns {Promise<{ sent: boolean, id?: string, logged?: boolean, error?: string }>}
 */
export async function send({ to, template, data = {} }) {
  const recipients = [to].flat().filter(Boolean);
  if (!recipients.length) throw new Error(`email: no recipient for "${template}"`);
  const { subject, html, text } = render(template, data);

  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      console.warn(`[email] RESEND_API_KEY is not set; "${template}" to ${recipients.join(', ')} was not sent`);
    } else {
      console.info(`[email:console] to: ${recipients.join(', ')}\nsubject: ${subject}\n${text}\n`);
    }
    return { sent: false, logged: env.NODE_ENV !== 'production' };
  }

  try {
    const { data: res, error } = await (await client()).emails.send({
      from: env.EMAIL_FROM, to: recipients, subject, html, text,
    });
    if (error) throw error;
    return { sent: true, id: res?.id };
  } catch (err) {
    console.error(`[email] "${template}" to ${recipients.join(', ')} failed: ${err?.message ?? err}`);
    return { sent: false, error: err?.message ?? String(err) };
  }
}
