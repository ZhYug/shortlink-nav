-- Database optimization: lean indexes, normalized linked navigation data,
-- and database-maintained click totals.

DROP INDEX IF EXISTS idx_links_enabled;
DROP INDEX IF EXISTS idx_links_clicks;
DROP INDEX IF EXISTS idx_links_favorite;
DROP INDEX IF EXISTS idx_link_daily_stats_day;
DROP INDEX IF EXISTS idx_navigation_favorite;
DROP INDEX IF EXISTS idx_navigation_link_id;

CREATE INDEX IF NOT EXISTS idx_links_clicks_id
  ON links(clicks DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_links_created_at
  ON links(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_link_daily_stats_day_link
  ON link_daily_stats(day, link_id);
CREATE INDEX IF NOT EXISTS idx_navigation_enabled_order
  ON navigation(enabled, sort_order, id);

-- Linked navigation rows no longer duplicate link title/description/url/category/enabled/favorite.
-- Those fields remain on navigation only for standalone/manual navigation entries.
ALTER TABLE navigation RENAME TO navigation_legacy;

CREATE TABLE navigation (
  id INTEGER PRIMARY KEY,
  title TEXT,
  description TEXT,
  url TEXT,
  icon TEXT,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  favorite INTEGER CHECK (favorite IN (0, 1)),
  link_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (link_id IS NOT NULL OR (title IS NOT NULL AND url IS NOT NULL)),
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
);

INSERT INTO navigation(
  id,title,description,url,icon,category,sort_order,enabled,favorite,link_id,created_at,updated_at
)
SELECT
  id,
  CASE WHEN link_id IS NULL THEN title END,
  CASE WHEN link_id IS NULL THEN description END,
  CASE WHEN link_id IS NULL THEN url END,
  icon,
  CASE WHEN link_id IS NULL THEN category END,
  sort_order,
  enabled,
  CASE WHEN link_id IS NULL THEN favorite END,
  link_id,
  created_at,
  updated_at
FROM navigation_legacy;

DROP TABLE navigation_legacy;

CREATE INDEX IF NOT EXISTS idx_navigation_enabled_order
  ON navigation(enabled, sort_order, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_navigation_link_unique
  ON navigation(link_id)
  WHERE link_id IS NOT NULL;

-- Reconcile the denormalized total once before enabling live trigger maintenance.
UPDATE links
SET clicks = COALESCE((SELECT SUM(clicks) FROM link_daily_stats WHERE link_daily_stats.link_id = links.id), 0);

-- links.clicks remains a fast denormalized total, but application code only writes
-- link_daily_stats. These triggers keep the total atomic with the daily aggregate.
CREATE TRIGGER IF NOT EXISTS trg_link_daily_stats_insert
AFTER INSERT ON link_daily_stats
BEGIN
  UPDATE links
  SET clicks = clicks + NEW.clicks, last_clicked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.link_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_link_daily_stats_update
AFTER UPDATE OF clicks ON link_daily_stats
BEGIN
  UPDATE links
  SET clicks = clicks + (NEW.clicks - OLD.clicks), last_clicked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.link_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_link_daily_stats_delete
AFTER DELETE ON link_daily_stats
BEGIN
  UPDATE links
  SET clicks = MAX(0, clicks - OLD.clicks)
  WHERE id = OLD.link_id;
END;
