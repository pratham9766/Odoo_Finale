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
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('SAMETA <no-reply@sameta.app>'),
  PUBLIC_TRACK_BASE_URL: z.string().url(),
  JOBS_ENABLED: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

// empty strings in .env mean "not set"
for (const k of ['SUPABASE_JWT_SECRET', 'RESEND_API_KEY']) {
  if (!parsed.data[k]) parsed.data[k] = undefined;
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
