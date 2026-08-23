// Must be imported before anything else in main.tsx so Sentry can
// instrument every subsequently-loaded module (AD-15). An unset
// VITE_SENTRY_DSN makes this a no-op client — safe for local development.
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || undefined,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});
