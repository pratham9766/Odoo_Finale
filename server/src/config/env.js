import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
  CLIENT_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  DATABASE_URL: z.string(),
  AI_DATABASE_URL: z.string(),
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('TexLink <no-reply@texlink.app>'),
  PUBLIC_TRACK_BASE_URL: z.string().url(),
  ORG_APPROVAL_REQUIRED: bool(false),
  JOBS_ENABLED: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

// empty strings in .env mean "not set"
for (const k of ['SUPABASE_JWT_SECRET', 'GEMINI_API_KEY', 'RESEND_API_KEY']) {
  if (!parsed.data[k]) parsed.data[k] = undefined;
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
