-- ClipForge AI — initial schema
-- Postgres 16. Runs automatically on first `docker compose up` (mounted to initdb),
-- or apply manually with `psql "$DATABASE_URL" -f 001_init.sql`.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE plan_tier      AS ENUM ('free', 'pro');
  CREATE TYPE video_source   AS ENUM ('upload', 'youtube');
  CREATE TYPE job_status     AS ENUM ('queued', 'transcribing', 'analyzing', 'rendering', 'ready', 'failed');
  CREATE TYPE clip_category  AS ENUM ('funny', 'emotional', 'controversial', 'opinion', 'story', 'engagement');
  CREATE TYPE user_role      AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- Users (mirrors Supabase auth.users; keyed by the Supabase auth UID)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY,                       -- == Supabase auth.uid()
  email          TEXT UNIQUE NOT NULL,
  full_name      TEXT,
  avatar_url     TEXT,
  role           user_role NOT NULL DEFAULT 'user',
  plan           plan_tier NOT NULL DEFAULT 'free',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Videos (a "project" in the UI == one uploaded source video)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  source         video_source NOT NULL,
  source_url     TEXT,                                   -- YouTube URL when source='youtube'
  storage_path   TEXT,                                   -- Supabase storage key for the uploaded file
  duration_sec   NUMERIC,
  size_bytes     BIGINT,
  status         job_status NOT NULL DEFAULT 'queued',
  error_message  TEXT,
  progress       INT NOT NULL DEFAULT 0,                 -- 0..100 for the UI progress bar
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_videos_user   ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

-- ─────────────────────────────────────────────
-- Transcripts (full transcript + word-level timestamps for captions)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcripts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id       UUID NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  language       TEXT,
  text           TEXT NOT NULL,
  words          JSONB NOT NULL DEFAULT '[]',            -- [{word, start, end}]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Clips (AI-detected segments)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id       UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  category       clip_category NOT NULL,
  start_sec      NUMERIC NOT NULL,
  end_sec        NUMERIC NOT NULL,
  virality_score INT NOT NULL DEFAULT 0,                 -- 0..100, AI-estimated
  reason         TEXT,                                   -- why the AI picked this moment
  transcript_slice TEXT,                                 -- the words spoken in this clip
  caption_style  TEXT NOT NULL DEFAULT 'bold-center',
  captions       JSONB NOT NULL DEFAULT '[]',            -- editable word-by-word caption tokens
  hooks          JSONB NOT NULL DEFAULT '[]',            -- 10 viral hook strings
  titles         JSONB NOT NULL DEFAULT '{}',            -- {tiktok, shorts, reel}
  hashtags       JSONB NOT NULL DEFAULT '{}',            -- {trending:[], niche:[], seo:[]}
  render_path    TEXT,                                   -- storage key of the exported 1080x1920 mp4
  render_status  job_status NOT NULL DEFAULT 'queued',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clip_time_valid CHECK (end_sec > start_sec)
);
CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_id);
CREATE INDEX IF NOT EXISTS idx_clips_user  ON clips(user_id);

-- ─────────────────────────────────────────────
-- Usage tracking (drives Free-plan quota + analytics)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,                          -- 'video_processed' | 'clip_generated' | 'clip_exported'
  video_id       UUID REFERENCES videos(id) ON DELETE SET NULL,
  caption_style  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_kind      ON usage_events(kind);

-- ─────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated  BEFORE UPDATE ON users  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_videos_updated BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_clips_updated  BEFORE UPDATE ON clips  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- Analytics helper view (used by the admin panel)
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_overview AS
SELECT
  (SELECT count(*) FROM users)                                          AS total_users,
  (SELECT count(*) FROM users WHERE plan = 'pro')                       AS pro_users,
  (SELECT count(*) FROM videos WHERE status = 'ready')                  AS videos_processed,
  (SELECT count(*) FROM clips)                                          AS clips_generated,
  (SELECT count(*) FROM usage_events
     WHERE kind = 'video_processed'
     AND created_at > now() - interval '30 days')                       AS videos_last_30d;
