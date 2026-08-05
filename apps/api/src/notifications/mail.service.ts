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
    const link = new URL(this.resetPasswordUrl);
    link.searchParams.set('token', rawToken);
    return this.attemptSend(email, link.toString(), 0);
  }

  private async attemptSend(
    email: string,
    link: string,
    retryCount: number,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.log(
        `RESEND_API_KEY not set — would have sent password reset email to ${email}`,
      );
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.mailFrom,
        to: email,
        subject: 'Reset your Evergreen password',
        html: this.buildHtml(link),
      });
      if (error) {
        throw new Error(`Resend API error (${error.name}): ${error.message}`);
      }
    } catch (err) {
      this.scheduleRetryOrGiveUp(email, link, retryCount, err);
    }
  }

  private scheduleRetryOrGiveUp(
    email: string,
    link: string,
    retryCount: number,
    err: unknown,
  ): void {
    if (retryCount >= RETRY_DELAYS_MS.length) {
      this.logger.error(
        `Giving up sending password reset email to ${email} after ${RETRY_DELAYS_MS.length} retries`,
      );
      Sentry.captureException(err);
      return;
    }

    const delayMs = RETRY_DELAYS_MS[retryCount];
    this.logger.warn(
      `Failed to send password reset email to ${email}; retrying in ${delayMs}ms ` +
        `(retry ${retryCount + 1}/${RETRY_DELAYS_MS.length})`,
    );
    setTimeout(() => {
      void this.attemptSend(email, link, retryCount + 1);
    }, delayMs);
  }

  private buildHtml(link: string): string {
    return (
      '<p>We received a request to reset your Evergreen password.</p>' +
      `<p><a href="${link}">Click here to set a new password</a>. ` +
      'This link expires in 1 hour and can only be used once.</p>' +
      "<p>If you didn't request this, you can safely ignore this email.</p>"
    );
  }
}
