// Reads and validates environment variables once at start-up (the server refuses to run with a bad config).
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
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Everest Textile Mills <no-reply@example.com>'),
  PUBLIC_TRACK_BASE_URL: z.string().url(),
  JOBS_ENABLED: bool(true),
  HOST: z.string().default('0.0.0.0'),                       // interface the API listens on (0.0.0.0 so a phone on the same Wi-Fi can reach it)
  CORS_ORIGINS: z.string().optional(),                       // extra browser origins, comma separated, besides CLIENT_URL
  // RFID: the virtual scanner is a demo / development tool and is OFF unless this is explicitly 'true'
  RFID_SIMULATOR_ENABLED: z.enum(['true', 'false', '1', '0', '']).optional(),
  RFID_DUPLICATE_WINDOW_SEC: z.coerce.number().int().min(1).max(3600).default(3),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

// empty strings in .env mean "not set"
for (const k of ['SUPABASE_JWT_SECRET', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  if (!parsed.data[k]) parsed.data[k] = undefined;
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
env.RFID_SIMULATOR_ENABLED = ['true', '1'].includes(env.RFID_SIMULATOR_ENABLED ?? '');
if (env.RFID_SIMULATOR_ENABLED && isProd) console.warn('[rfid] WARNING: the virtual scanner is enabled while NODE_ENV=production; turn RFID_SIMULATOR_ENABLED off for real use');
