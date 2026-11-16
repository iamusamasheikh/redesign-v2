import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter = null;
if (config.mail.host && config.mail.user && config.mail.pass) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.pass },
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const mailEnabled = () => Boolean(transporter);

export async function sendLeadEmails(lead) {
  if (!transporter) return { sent: false, reason: 'SMTP not configured' };
  const rows = [
    ['Name', lead.name], ['Email', lead.email], ['Phone / WhatsApp', lead.phone],
    ['Service', lead.service], ['Estimate', lead.estimate], ['Page', lead.page],
  ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 12px;color:#666">${k}</td><td style="padding:6px 12px"><b>${esc(v)}</b></td></tr>`).join('');

  await transporter.sendMail({
    from: config.mail.from,
    to: config.mail.to,
    replyTo: lead.email,
    subject: `New inquiry: ${lead.name}${lead.service ? ' · ' + lead.service : ''}`,
    html: `<h2 style="font-family:sans-serif">New website inquiry</h2><table style="font-family:sans-serif;font-size:14px">${rows}</table>
           <p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;border-left:3px solid #2C5BEA;padding-left:12px">${esc(lead.message)}</p>`,
    text: `New inquiry from ${lead.name} <${lead.email}>\nPhone: ${lead.phone}\nService: ${lead.service}\nEstimate: ${lead.estimate}\n\n${lead.message}`,
  });

  // Short confirmation to the client.
  await transporter.sendMail({
    from: config.mail.from,
    to: lead.email,
    subject: 'Thanks, your message reached Usama Sheikh',
    text: `Hi ${lead.name},\n\nThanks for getting in touch. I have received your message and will reply within 24 hours.\n\nIf it is urgent, message me on WhatsApp: +92 300 7856880.\n\nUsama Sheikh\nhttps://usamasheikh.com`,
  }).catch(() => {});
  return { sent: true };
}
