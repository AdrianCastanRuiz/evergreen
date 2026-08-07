import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { Resend } from 'resend';
import { MailService } from './mail.service';

jest.mock('resend');
jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

describe('MailService', () => {
  let sendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock = jest.fn();
    (Resend as jest.MockedClass<typeof Resend>).mockImplementation(
      () => ({ emails: { send: sendMock } }) as unknown as Resend,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function buildService(apiKey: string): Promise<MailService> {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'RESEND_API_KEY') return apiKey;
        if (key === 'MAIL_FROM') return 'noreply@evergreen.test';
        return undefined;
      }),
      getOrThrow: jest.fn(() => 'http://localhost:5173/reset-password'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: config }],
    }).compile();

    return module.get(MailService);
  }

  it('no-ops (does not call Resend) when RESEND_API_KEY is unset', async () => {
    const mailService = await buildService('');

    await mailService.sendPasswordResetEmail('a@b.com', 'raw-token');

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends via Resend with the reset link when RESEND_API_KEY is set', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const mailService = await buildService('re_test_key');

    await mailService.sendPasswordResetEmail('a@b.com', 'raw-token');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [sendArgs] = sendMock.mock.calls[0] as [
      { to: string; from: string; html: string },
    ];
    expect(sendArgs.to).toBe('a@b.com');
    expect(sendArgs.from).toBe('noreply@evergreen.test');
    expect(sendArgs.html).toContain(
      'http://localhost:5173/reset-password?token=raw-token',
    );
  });

  it('retries at 60s -> 5min -> 30min on failure, then gives up and reports to Sentry', async () => {
    jest.useFakeTimers();
    sendMock.mockRejectedValue(new Error('network down'));
    const mailService = await buildService('re_test_key');

    await mailService.sendPasswordResetEmail('a@b.com', 'raw-token');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(sendMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(sendMock).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(30 * 60_000);
    expect(sendMock).toHaveBeenCalledTimes(4);

    // Exhausted all 3 retries (4 total attempts) — final failure is logged
    // to Sentry and dropped, never surfaced to a caller.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('also retries when Resend resolves with an error payload instead of throwing', async () => {
    jest.useFakeTimers();
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'application_error', message: 'boom', statusCode: 500 },
    });
    const mailService = await buildService('re_test_key');

    await mailService.sendPasswordResetEmail('a@b.com', 'raw-token');
    expect(sendMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  describe('sendAccountInviteEmail', () => {
    it('sends distinct invite copy (not the reset-password copy) via Resend', async () => {
      sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
      const mailService = await buildService('re_test_key');

      await mailService.sendAccountInviteEmail(
        'admin@b.com',
        'raw-token',
        'Evergreen Oaks',
      );

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [sendArgs] = sendMock.mock.calls[0] as [
        { to: string; from: string; subject: string; html: string },
      ];
      expect(sendArgs.to).toBe('admin@b.com');
      expect(sendArgs.subject).toBe("You've been invited to Evergreen");
      expect(sendArgs.html).toContain('Evergreen Oaks');
      expect(sendArgs.html).toContain(
        'http://localhost:5173/reset-password?token=raw-token',
      );
      expect(sendArgs.html).not.toContain('We received a request to reset');
    });

    it('no-ops when RESEND_API_KEY is unset', async () => {
      const mailService = await buildService('');

      await mailService.sendAccountInviteEmail(
        'admin@b.com',
        'raw-token',
        'Evergreen Oaks',
      );

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('retries at 60s -> 5min -> 30min on failure, then gives up and reports to Sentry', async () => {
      jest.useFakeTimers();
      sendMock.mockRejectedValue(new Error('network down'));
      const mailService = await buildService('re_test_key');

      await mailService.sendAccountInviteEmail(
        'admin@b.com',
        'raw-token',
        'Evergreen Oaks',
      );
      expect(sendMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(60_000);
      expect(sendMock).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(5 * 60_000);
      expect(sendMock).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(30 * 60_000);
      expect(sendMock).toHaveBeenCalledTimes(4);

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
  });
});
