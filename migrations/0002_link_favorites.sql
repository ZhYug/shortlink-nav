-- Add persistent favorites for short links.
ALTER TABLE links ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_links_favorite ON links(favorite DESC, id DESC);
