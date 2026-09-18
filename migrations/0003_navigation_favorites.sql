-- Add persistent favorites for navigation entries.
ALTER TABLE navigation ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_navigation_favorite ON navigation(favorite DESC, sort_order ASC, id ASC);
