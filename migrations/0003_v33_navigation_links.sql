ALTER TABLE navigation ADD COLUMN link_id INTEGER REFERENCES links(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_navigation_link_id ON navigation(link_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_navigation_link_unique
ON navigation(link_id)
WHERE link_id IS NOT NULL;

INSERT OR IGNORE INTO settings(key,value) VALUES
('nav_tag_style','pills'),
('nav_columns_mobile','2'),
('nav_columns_tablet','3'),
('nav_columns_desktop','4'),
('nav_columns_wide','6'),
('nav_category_order',''),
('nav_hidden_categories','');
