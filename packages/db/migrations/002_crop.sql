-- Per-clip horizontal crop position (0=left, 0.5=center, 1=right) for the 9:16 export.
ALTER TABLE clips ADD COLUMN IF NOT EXISTS crop_x NUMERIC NOT NULL DEFAULT 0.5;
