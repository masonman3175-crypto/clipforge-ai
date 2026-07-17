-- Clip layout: 'fit' (blurred bars, whole screen) or 'fill' (crop/zoom).
ALTER TABLE clips ADD COLUMN IF NOT EXISTS layout TEXT NOT NULL DEFAULT 'fit';
