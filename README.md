# ShortLink Nav V3.1

Cloudflare Pages + Pages Functions + D1 的短链接 / 导航一体化项目。此版本基于 V3 重构，修复后台登录、/admin 路由、自定义图标、首页标题设置、短码编辑校验和数据库错误处理。


## V3.1 主要修复

- 修复登录/退出接口 `Response` 参数错误。
- `/admin` 与 `/admin/` 显式映射到 `admin.html`。
- SESSION_SECRET 未配置时不再使用弱默认密钥。
- Session payload 使用 base64url，解析更可靠。
- 编辑短链接与新建短链接统一校验短码和 URL。
- 重复短码返回 409，而不是 500。
- 自定义导航图标真正生效。
- 首页标题、首页描述独立设置。
- 前台与后台主题状态持久化。
- API 默认 `no-store`，避免后台数据被缓存。
- D1 增加常用索引。
- 保留 V3 的收藏、最近访问、搜索、分类、拖拽排序、二维码、CSV 导入导出、14 天点击趋势。

## 部署

### 1. 创建 D1

```bash
npx wrangler d1 create shortlink-nav
```

把返回的 `database_id` 写入 `wrangler.toml` 的 `database_id`。

### 2. 执行 D1 migration

```bash
npx wrangler d1 migrations apply shortlink-nav --remote
```

本项目包含 `0001_initial.sql` 和 `0002_v31_settings.sql`。新数据库会按顺序执行；已有 V3 数据库执行 migration 后会保留原有数据。

### 3. 配置 Secrets

在 Cloudflare Pages 项目中添加：

- `ADMIN_PASSWORD`：后台登录密码
- `SESSION_SECRET`：随机长字符串，建议至少 32 字符

### 4. 绑定 D1

Cloudflare Pages 项目中绑定 D1，Binding 名称必须为：

`DB`

### 5. 部署

Framework preset：`None`

Build command：留空

Build output directory：`public`

也可以使用 Wrangler：

```bash
npx wrangler pages deploy public
```

## 本地开发

复制 `.dev.vars.example` 为 `.dev.vars`，填写密码和随机 SESSION_SECRET：

```bash
npx wrangler pages dev public
```

## 项目结构

```text
shortlink-nav-v3.1/
├── functions/
│   └── [[path]].js
├── migrations/
│   ├── 0001_initial.sql
│   └── 0002_v31_settings.sql
├── public/
│   ├── assets/
│   │   ├── app.js
│   │   ├── admin.js
│   │   ├── styles.css
│   │   └── favicon.svg
│   ├── index.html
│   └── admin.html
├── .dev.vars.example
├── .gitignore
├── package.json
├── README.md
└── wrangler.toml
```

二维码功能使用 jsDelivr 的 qrcode 浏览器库；默认 favicon 使用 Google favicon 服务。


## V3.1 Fixed deployment
This version uses Cloudflare Pages Advanced Mode via `public/_worker.js`. The old `functions/[[path]].js` directory has been removed to avoid the Pages build error `No routes found when building Functions directory`.
