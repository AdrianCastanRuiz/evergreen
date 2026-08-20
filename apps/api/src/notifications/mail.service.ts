import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { Resend } from 'resend';

// NFR15: a transient Resend failure is retried at 60s, then 5min, then
// 30min, before being given up on. `setTimeout`-based, not a durable queue —
// no queue infra (Redis/BullMQ) exists yet, so a pending retry is lost on
// process restart (accepted V1 tradeoff, see deferred-work.md).
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly mailFrom: string;
  private readonly resetPasswordUrl: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    // Mirrors the SENTRY_DSN convention (AD-15): an unset API key makes this
    // a no-op (logs instead of sending) rather than a crash, so local
    // dev/CI need no real key (AD-14).
    this.resend = apiKey ? new Resend(apiKey) : null;
    const mailFrom = config.get<string>('MAIL_FROM');
    if (apiKey && !mailFrom) {
      // Resend's sandbox address only delivers to the account owner — a real
      // deploy with a key but no configured sender would silently fail every
      // send to an actual user, so this misconfiguration gets a boot-time
      // warning instead of a silent 3-week-later "nobody got their email".
      this.logger.warn(
        'RESEND_API_KEY is set but MAIL_FROM is not — falling back to the ' +
          'Resend sandbox address, which will not deliver to real recipients',
      );
    }
    this.mailFrom = mailFrom || 'onboarding@resend.dev';
    this.resetPasswordUrl = config.getOrThrow<string>('RESET_PASSWORD_URL');
  }

  // Never rejects — a send failure is retried/logged internally, never
  // surfaced to the caller (who has already responded to the HTTP request
  // by the time this settles).
  sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    const link = this.buildLink(rawToken);
    return this.attemptSend({
      email,
      subject: 'Reset your Evergreen password',
      html: this.buildResetHtml(link),
      logLabel: 'password reset email',
      retryCount: 0,
    });
  }

  // Story 1.3: invite-created pending accounts (home admins, and later
  // additional super admins / staff / family) activate via the exact same
  // token mechanism as a self-service reset — but the copy must not claim
  // "we received a request to reset your password", since this person never
  // requested anything.
  sendAccountInviteEmail(
    email: string,
    rawToken: string,
    homeName: string,
  ): Promise<void> {
    const link = this.buildLink(rawToken);
    return this.attemptSend({
      email,
      subject: "You've been invited to Evergreen",
      html: this.buildInviteHtml(link, homeName),
      logLabel: 'account invite email',
      retryCount: 0,
    });
  }

  // Story 1.4: platform-level super_admin invites — no home to name, so this
  // is a genuinely separate method/copy from sendAccountInviteEmail rather
  // than an optional `homeName` on that one (mirrors why buildResetHtml and
  // buildInviteHtml are already two separate methods, not one flexible one).
  sendSuperAdminInviteEmail(email: string, rawToken: string): Promise<void> {
    const link = this.buildLink(rawToken);
    return this.attemptSend({
      email,
      subject: "You've been invited to Evergreen",
      html: this.buildSuperAdminInviteHtml(link),
      logLabel: 'super admin invite email',
      retryCount: 0,
    });
  }

  // Story 1.5: an existing family user who already has a password gains
  // access to a second home. There's no token to consume — they can already
  // log in — so this is deliberately NOT the activation-link flow
  // (sendAccountInviteEmail); a "click here to set your password" email to
  // someone who already has one would be confusing, not reassuring.
  sendHomeAccessAddedEmail(email: string, homeName: string): Promise<void> {
    return this.attemptSend({
      email,
      subject: 'You now have access to a new home on Evergreen',
      html: this.buildHomeAccessAddedHtml(homeName),
      logLabel: 'home access added notification',
      retryCount: 0,
    });
  }

  private buildLink(rawToken: string): string {
    const link = new URL(this.resetPasswordUrl);
    link.searchParams.set('token', rawToken);
    return link.toString();
  }

  private async attemptSend(params: {
    email: string;
    subject: string;
    html: string;
    logLabel: string;
    retryCount: number;
  }): Promise<void> {
    const { email, subject, html, logLabel } = params;

    if (!this.resend) {
      this.logger.log(
        `RESEND_API_KEY not set — would have sent ${logLabel} to ${email}`,
      );
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.mailFrom,
        to: email,
        subject,
        html,
      });
      if (error) {
        throw new Error(`Resend API error (${error.name}): ${error.message}`);
      }
    } catch (err) {
      this.scheduleRetryOrGiveUp({ ...params, err });
    }
  }

  private scheduleRetryOrGiveUp(params: {
    email: string;
    subject: string;
    html: string;
    logLabel: string;
    retryCount: number;
    err: unknown;
  }): void {
    const { email, logLabel, retryCount, err } = params;

    if (retryCount >= RETRY_DELAYS_MS.length) {
      this.logger.error(
        `Giving up sending ${logLabel} to ${email} after ${RETRY_DELAYS_MS.length} retries`,
      );
      Sentry.captureException(err);
      return;
    }

    const delayMs = RETRY_DELAYS_MS[retryCount];
    this.logger.warn(
      `Failed to send ${logLabel} to ${email}; retrying in ${delayMs}ms ` +
        `(retry ${retryCount + 1}/${RETRY_DELAYS_MS.length})`,
    );
    setTimeout(() => {
      void this.attemptSend({ ...params, retryCount: retryCount + 1 });
    }, delayMs);
  }

  private buildResetHtml(link: string): string {
    return (
      '<p>We received a request to reset your Evergreen password.</p>' +
      `<p><a href="${link}">Click here to set a new password</a>. ` +
      'This link expires in 1 hour and can only be used once.</p>' +
      "<p>If you didn't request this, you can safely ignore this email.</p>"
    );
  }

  private buildInviteHtml(link: string, homeName: string): string {
    return (
      `<p>You've been invited to help manage <strong>${this.escapeHtml(homeName)}</strong> on Evergreen.</p>` +
      `<p><a href="${link}">Click here to set your password</a> and activate your account. ` +
      'This link expires in 1 hour and can only be used once.</p>' +
      "<p>If you weren't expecting this invite, you can safely ignore this email.</p>"
    );
  }

  private buildSuperAdminInviteHtml(link: string): string {
    return (
      "<p>You've been invited to become a super admin on Evergreen, with platform-wide access.</p>" +
      `<p><a href="${link}">Click here to set your password</a> and activate your account. ` +
      'This link expires in 1 hour and can only be used once.</p>' +
      "<p>If you weren't expecting this invite, you can safely ignore this email.</p>"
    );
  }

  private buildHomeAccessAddedHtml(homeName: string): string {
    return (
      `<p>You now have access to <strong>${this.escapeHtml(homeName)}</strong> on Evergreen.</p>` +
      '<p>Log in with your existing password to switch between your homes.</p>'
    );
  }

  // `homeName` is user-supplied (Home.name, only length/type-validated) and
  // gets interpolated into a real outbound HTML email — escape it so a home
  // named e.g. `Oaks <img onerror=...>` can't inject markup into the
  // invitee's inbox (code-review finding).
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
