// Import first — instruments every module loaded after it (AD-15).
import './instrument';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Reads the refresh_token cookie apps/admin's browser session relies on
  // (Story 1.14) — mobile is unaffected, it never sends cookies.
  app.use(cookieParser());

  // getOrThrow via ConfigService, not process.env directly — matches this
  // codebase's established pattern for required env vars (see
  // MailService's RESET_PASSWORD_URL) and keeps this read backed by the
  // same Joi-validated source env.validation.ts already enforces at boot.
  const configService = app.get(ConfigService);

  // No client could call this API cross-origin before this line existed.
  // Single explicit origin, not "*": browsers reject credentialed
  // (cookie-carrying) responses paired with a wildcard origin (Story 1.14).
  app.enableCors({
    origin: configService.getOrThrow<string>('ADMIN_APP_URL'),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
