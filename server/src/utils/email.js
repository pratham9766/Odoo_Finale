// CONTRACT STUB (owner: Hrishikesh) — signature agreed in §22.2:
//   email.send({ to, template, data })
// Logs to the console when RESEND_API_KEY is missing. Hrishikesh replaces the
// templates with proper HTML; keep the signature.
import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const templates = {
  staff_invite: (d) => ({
    subject: `You're invited to join ${d.org_name} on TexLink`,
    text: `${d.inviter ?? 'Someone'} invited you to join ${d.org_name} as ${d.role}.\nAccept: ${d.link}\nThis link expires in 7 days.`,
  }),
  partner_invite: (d) => ({
    subject: `${d.org_name} wants to connect with you on TexLink`,
    text: `${d.org_name} invited your company to connect as their ${d.relation}.\nAccept: ${d.link}`,
  }),
  order_status: (d) => ({
    subject: `Order ${d.order_no}: ${d.status.replace(/_/g, ' ')}`,
    text: `Your order ${d.order_no} with ${d.mill} is now ${d.status.replace(/_/g, ' ')}.\nTrack: ${d.link ?? ''}`,
  }),
  delivery_otp: (d) => ({
    subject: `Delivery OTP for ${d.dispatch_no}`,
    text: `Dispatch ${d.dispatch_no} is on the way. Share this OTP with the driver only on delivery: ${d.otp}`,
  }),
  overdue_reminder: (d) => ({
    subject: `Payment reminder: invoice ${d.invoice_no}`,
    text: `Invoice ${d.invoice_no} of ₹${d.outstanding} was due on ${d.due_date}.`,
  }),
};

export async function send({ to, template, data = {} }) {
  const t = templates[template];
  if (!t) throw new Error(`Unknown email template: ${template}`);
  const { subject, text, html } = t(data);
  if (!resend) {
    console.log(`[email:dev] to=${[].concat(to).join(',')} subject="${subject}"\n${text}`);
    return { id: 'dev-console' };
  }
  const { data: res, error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, text, html });
  if (error) console.error('[email]', error);
  return res;
}

export default { send };
