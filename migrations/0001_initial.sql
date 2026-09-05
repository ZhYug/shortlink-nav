CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  clicks INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
CREATE INDEX IF NOT EXISTS idx_links_enabled ON links(enabled);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at);

CREATE TABLE IF NOT EXISTS link_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_link_visits_link_date ON link_visits(link_id, visited_at);

CREATE TABLE IF NOT EXISTS navigation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  icon TEXT,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_navigation_order ON navigation(sort_order);
CREATE INDEX IF NOT EXISTS idx_navigation_enabled_order ON navigation(enabled,sort_order);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings(key,value) VALUES
('site_title','My Navigation'),
('site_subtitle','Personal navigation & short links'),
('site_description','Everything you need, one click away.'),
('accent','#8b6cff');

INSERT OR IGNORE INTO navigation(title,description,url,icon,category,sort_order,enabled) VALUES
('GitHub','代码仓库与开源项目','https://github.com','', '开发',0,1),
('Google','搜索与常用服务','https://www.google.com','', '工具',1,1),
('Cloudflare','网络与边缘服务','https://dash.cloudflare.com','', '开发',2,1),
('ChatGPT','AI 助手','https://chatgpt.com','', 'AI',3,1);
