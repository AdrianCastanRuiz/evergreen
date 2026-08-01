// Must be imported before anything else in main.ts so Sentry can instrument
// every subsequently-loaded module (AD-15). An empty/unset SENTRY_DSN makes
// this a no-op client — safe for local development.
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});
