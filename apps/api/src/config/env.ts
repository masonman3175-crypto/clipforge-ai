import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the repo-root .env (this file lives at apps/api/src/config, so root is 4 up).
// In production (Render/Vercel) there is no .env file and platform env vars are
// used instead — dotenv silently does nothing when the file is absent.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../../.env') });

/**
 * Centralised, validated environment config.
 * Fails fast at boot if a required variable is missing so we never ship
 * a half-configured server to production.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Render/Heroku/etc inject PORT; fall back to API_PORT, then 4000.
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default('clipforge-media'),
  // No longer required: tokens are validated via supabaseAdmin.auth.getUser().
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Cloudflare R2 (S3-compatible) storage. When all are set, storage uses R2
  // (no 50MB cap) instead of Supabase Storage. Falls back to Supabase otherwise.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  // AI provider: Groq (free, no card) is used when GROQ_API_KEY is set,
  // otherwise OpenAI. At least one should be provided for processing to work.
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  OPENAI_ANALYSIS_MODEL: z.string().default('gpt-4o-mini'),
  GROQ_TRANSCRIBE_MODEL: z.string().default('whisper-large-v3'),
  GROQ_ANALYSIS_MODEL: z.string().default('llama-3.3-70b-versatile'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),

  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  FREE_PLAN_VIDEOS_PER_MONTH: z.coerce.number().default(3),
  MAX_UPLOAD_MB: z.coerce.number().default(2048),

  ADMIN_EMAILS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Strip stray non-printable/non-ASCII characters that sneak into secrets when
// they're pasted into hosting dashboards. Every value below is plain ASCII, so
// this only removes junk that would otherwise break auth headers / API calls.
const clean = <T extends string | undefined>(s: T): T =>
  (s == null ? s : (s.replace(/[^\x21-\x7E]/g, '') as T));

export const env = {
  ...parsed.data,
  // Effective listen port: platform-provided PORT wins over API_PORT.
  API_PORT: parsed.data.PORT ?? parsed.data.API_PORT,
  DATABASE_URL: clean(parsed.data.DATABASE_URL),
  SUPABASE_URL: clean(parsed.data.SUPABASE_URL),
  SUPABASE_SERVICE_ROLE_KEY: clean(parsed.data.SUPABASE_SERVICE_ROLE_KEY),
  OPENAI_API_KEY: clean(parsed.data.OPENAI_API_KEY),
  GROQ_API_KEY: clean(parsed.data.GROQ_API_KEY),
  R2_ACCOUNT_ID: clean(parsed.data.R2_ACCOUNT_ID),
  R2_ACCESS_KEY_ID: clean(parsed.data.R2_ACCESS_KEY_ID),
  R2_SECRET_ACCESS_KEY: clean(parsed.data.R2_SECRET_ACCESS_KEY),
  R2_BUCKET: clean(parsed.data.R2_BUCKET),
  STRIPE_SECRET_KEY: clean(parsed.data.STRIPE_SECRET_KEY),
  STRIPE_WEBHOOK_SECRET: clean(parsed.data.STRIPE_WEBHOOK_SECRET),
  STRIPE_PRICE_PRO_MONTHLY: clean(parsed.data.STRIPE_PRICE_PRO_MONTHLY),
  adminEmails: parsed.data.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};
