-- Enhanced license system: tiers, device tracking, expiration, Discord bot integration.

-- Add new columns to the existing licenses table.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'pro';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_devices INT NOT NULL DEFAULT 1;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS device_fingerprints JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

-- Free trial tracking: one free video per user, no key needed.
CREATE TABLE IF NOT EXISTS free_trials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  videos_used INT NOT NULL DEFAULT 0,
  max_videos INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- License validation log: tracks every time a key is checked (for abuse detection).
CREATE TABLE IF NOT EXISTS license_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_fingerprint TEXT,
  ip_address TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_license_validations_license_id ON license_validations(license_id);
CREATE INDEX IF NOT EXISTS idx_license_validations_created_at ON license_validations(created_at);

-- Update the existing licenses that were redeemed to have tier = 'pro'.
UPDATE licenses SET tier = 'pro' WHERE status = 'redeemed' AND tier = 'pro';

-- Seed a sample free trial row comment: free_trials are created on-demand when a new user signs up.
