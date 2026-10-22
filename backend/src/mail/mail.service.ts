import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

/**
 * Sends email through Gmail's SMTP server.
 * Set SMTP_USER to the Gmail address and SMTP_PASS to a Google "App password" (not the normal password: Google account > Security > 2-Step Verification > App passwords).
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private transport?: Transporter;

  get configured() {
    return !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
  }

  private get from() {
    return process.env.MAIL_FROM || `PlayCircle <${process.env.SMTP_USER}>`;
  }

  private tx(): Transporter {
    return (this.transport ??= createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE ?? 'true') !== 'false', // 465 = TLS from the start; use SMTP_PORT=587 and SMTP_SECURE=false for STARTTLS
      auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') }, // Google shows app passwords in groups of four
    }));
  }

  /** Never throws: a mail problem must not break the request that asked for it. Returns whether it was sent. */
  async send(to: string, subject: string, text: string, html: string): Promise<boolean> {
    if (!this.configured) { this.log.warn(`SMTP_USER / SMTP_PASS are not set, so "${subject}" to ${to} was not sent`); return false; }
    try {
      await this.tx().sendMail({ from: this.from, to, subject, text, html });
      return true;
    } catch (e) {
      this.log.error(`Could not send "${subject}": ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  async sendResetCode(to: string, name: string, code: string, minutes: number) {
    const text = `Hi ${name},\n\nYour PlayCircle password reset code is ${code}.\nIt works for about ${minutes} minutes. If you did not ask for it, ignore this email: your password has not changed.\n\nPlayCircle`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#0B1020;color:#F2F5FF;border-radius:16px">
<h2 style="margin:0 0 8px">PlayCircle</h2><p style="color:#98A2C8;margin:0 0 20px">Hi ${escapeHtml(name)}, here is your password reset code:</p>
<div style="font-size:36px;font-weight:800;letter-spacing:10px;text-align:center;background:#151C33;border-radius:12px;padding:16px;color:#FFC83D">${code}</div>
<p style="color:#98A2C8;font-size:13px;margin:20px 0 0">It works for about ${minutes} minutes. If you did not ask for it, ignore this email: your password has not changed.</p></div>`;
    return this.send(to, 'Your PlayCircle reset code', text, html);
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
