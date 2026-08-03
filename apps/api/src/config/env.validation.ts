import * as Joi from 'joi';

// Validated once at process boot (ConfigModule.forRoot below) — an invalid
// or missing required var throws immediately and the process never starts
// partially configured (Consistency Conventions: Config).
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().uri().required(),
  DIRECT_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(16).required(),

  // Optional — the Sentry SDK no-ops when unset (AD-15).
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
});
