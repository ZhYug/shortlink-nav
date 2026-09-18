# ST Nav 1.0.0

> 轻量级个人导航 + 短链接管理系统，基于 **Cloudflare Pages Advanced Mode + D1**。
>
> **1.0.0 是当前发布版本号。** D1 的 `0001/0002/0003` 是数据库迁移编号，与应用版本号相互独立，请勿因为应用版本改为 1.0.0 而重置或删除已有 migration。

## 一、当前功能

### 前台导航
- 响应式导航卡片，支持分类、搜索、收藏、最近访问。
- 支持自定义站点标题、副标题、首页文案、SEO 描述和强调色。
- 支持移动端、平板、PC、大屏分别设置每行卡片数量。
- 支持隐藏分类、分类顺序和多种分类标签样式。

### 短链接管理
- 创建、编辑、删除短链接。
- 自定义短码或留空自动生成。
- 短码实时可用性检查，编辑时会排除当前记录。
- 单条启用/停用。
- 单条收藏，并与关联导航同步。
- 打开短链接、复制短链接。
- 排序、搜索、分类筛选、分页。
- 当前页选择、全部选择、取消选择。
- 批量加入导航、移出导航、启用、停用、删除。
- CSV 导入、CSV 导出。

### 导航管理
- 创建、编辑、删除导航项目。
- 上移、下移和保存排序。
- 打开链接、复制链接。
- 收藏 / 取消收藏。
- 单条启用 / 停用。
- 当前页选择、全部选择、取消选择。
- 批量启用、停用、删除。
- 移动端采用单列紧凑卡片；PC 端保持多列布局。
- 与短链接关联的导航会同步关联短链接的收藏和启停状态。

### 数据管理
- 短链接 CSV 导入 / 导出。
- JSON 完整备份与恢复。
- 支持合并恢复和完全覆盖恢复。
- 备份包含短链接、导航、设置和点击统计。

## 二、项目结构

```text
st-nav/
├── public/
│   ├── _worker.js              # Pages Advanced Mode Worker 入口
│   ├── index.html              # 前台首页
│   ├── admin.html              # 管理后台
│   ├── assets/
│   │   ├── app.js
│   │   ├── admin.js
│   │   ├── common.js
│   │   └── styles.css
│   ├── sw.js
│   ├── manifest.webmanifest
│   └── .assetsignore
├── migrations/
│   ├── 0001_initial.sql        # D1 初始完整业务表 + 默认设置/示例导航
│   ├── 0002_link_favorites.sql # 短链接收藏字段
│   └── 0003_navigation_favorites.sql # 导航收藏字段
├── scripts/
│   └── doctor.mjs              # 项目结构与部署配置检查
├── .dev.vars.example
├── .gitignore
├── .nvmrc
├── package.json
└── wrangler.toml
```

> **不要删除 `public/_worker.js`。** Pages Advanced Mode 使用它接管请求，并通过 `env.ASSETS.fetch()` 返回静态资源。

## 三、第一次部署：推荐流程

### 1. 上传 GitHub

将整个项目目录上传到 GitHub，例如仓库名：`st-nav`。

推荐生产分支：`main`。

### 2. 创建 D1

在 Cloudflare Dashboard 创建 D1 数据库：

```text
Workers & Pages → D1 → Create database
```

数据库名称建议：

```text
st-nav
```

### 3. 配置 Wrangler

仓库中的 `wrangler.toml` **不保存真实 `database_id`**，只保留 D1 binding 和 migrations 目录：

```toml
[[d1_databases]]
binding = "DB"
database_name = "st-nav"
migrations_dir = "./migrations"
```

这是刻意设计的：Cloudflare D1 的 `database_id` 是资源标识，不需要提交到 Git。部署脚本会从 `D1_DATABASE_ID` 环境变量读取它，并临时生成 `.wrangler.deploy.toml`；部署完成后立即删除该临时文件。

### 4. 初始化数据库：自动完成

本项目使用标准 D1 migrations：

```text
migrations/0001_initial.sql
migrations/0002_link_favorites.sql
migrations/0003_navigation_favorites.sql
```

执行：

```bash
npm run deploy
```

脚本会按以下顺序自动执行：

```text
读取 D1_DATABASE_ID
        ↓
临时生成 Wrangler D1 配置
        ↓
wrangler d1 migrations apply DB --remote
        ↓
只执行尚未应用的 migration
        ↓
wrangler pages deploy public
        ↓
删除临时配置
```

因此**第一次部署**会自动创建全部数据库表、索引、默认设置和默认导航数据；**后续部署**只会执行新增 migration。Cloudflare D1 会记录已经应用的 migration，因此不需要删除数据库，也不会重复执行已经完成的 migration。

例如未来新增：

```text
migrations/0004_add_xxx.sql
```

再次运行 `npm run deploy`，只会应用 `0004_add_xxx.sql`。

> 重要：不要修改已经在生产环境执行过的 migration。数据库结构变更请始终新增 `0004`、`0005` 等 migration。

> `npm run deploy` 使用 Wrangler 的登录凭据，不要求项目中保存 `CLOUDFLARE_API_TOKEN`。首次在一台电脑上部署时运行 `npx wrangler login` 完成 OAuth 登录即可。

### 5. 配置 Cloudflare Pages

进入：

```text
Pages 项目 → Settings → Bindings → Add → D1 database
```

绑定：

```text
Variable name: DB
D1 database: st-nav
```

**变量名必须为 `DB`。**

另外，在 Production 环境变量中添加：

```text
D1_DATABASE_ID=你的 D1 database UUID
```

`D1_DATABASE_ID` 仅用于部署脚本执行远程 migration，不会被 Worker 在运行时使用。生产运行时真正连接数据库的是 Cloudflare Pages 的 `DB` D1 Binding。

### 7. 设置生产环境 Secret

在 Pages 项目的 Production 环境添加：

```text
ADMIN_PASSWORD=你的管理员密码
SESSION_SECRET=随机高熵字符串
```

建议：
- `ADMIN_PASSWORD` 使用较强密码。
- `SESSION_SECRET` 至少 32 个字符，并与管理员密码完全分开。
- 不要将真实 Secret 提交到 GitHub。

### 8. 部署

推荐使用项目提供的：

```bash
npm run deploy
```

如果使用 Cloudflare 的 Git/Build 自动部署，请确保构建环境能够运行 Wrangler，并提供 `D1_DATABASE_ID`；Cloudflare 的构建部署认证由 Cloudflare/构建环境提供，不要把 API Token 写进仓库。

部署完成后：

```text
https://你的项目.pages.dev/
https://你的项目.pages.dev/admin.html
```

## 四、以后升级数据库

**不要修改已经在生产环境执行过的 migration。**

如果未来需要数据库结构变化，应新增：

```text
migrations/0004_xxx.sql
migrations/0005_xxx.sql
```

然后重新部署：

```bash
npm run deploy
```

本项目的应用版本号从历史版本调整为 `1.0.0`，**不代表数据库 migration 要重新编号**。

## 五、本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

检查项目：

```bash
npm run doctor
```

本地开发使用 Wrangler Pages 模式，D1 本地数据库也通过 migration 初始化。

## 六、CLI 部署

已经完成 D1 和 Secret 配置后，直接执行：

```bash
npm run deploy
```

这个命令不是单纯的 Pages 上传，而是“**D1 migration + Pages 部署**”一体化流程。它会先应用所有尚未执行的 migration，再上传 `public/`。

首次使用 Wrangler 的电脑先执行一次：

```bash
npx wrangler login
```

不需要把 `CLOUDFLARE_API_TOKEN` 写入项目。

## 七、数据库与首次部署说明

### 空数据库

新建 D1 后，不需要自己创建 `links`、`navigation`、`settings` 等表。执行：

```bash
npm run deploy
```

即可自动完成当前数据库初始化并部署应用。

### 已有数据库

不要删除数据库，也不要重新执行 `0001_initial.sql`。

直接重新部署：

```bash
npm run deploy
```

Wrangler 会根据 D1 migration 历史执行待处理迁移。

### Worker 的数据库检查

Worker 启动 API 前会检查 D1 是否绑定以及基础业务表是否存在。如果数据库未初始化，后台 API 会明确提示数据库尚未初始化，而不是静默创建不完整的数据结构。

## 八、备份与恢复

后台的「系统管理 → 数据管理」提供：

- CSV 导入 / 导出
- JSON 备份
- JSON 合并恢复
- JSON 完全覆盖恢复

建议在执行覆盖恢复前先下载一份新的 JSON 备份。

## 九、常见问题

### 页面可以打开，但后台 API 报数据库错误

检查：

1. `npm run deploy` 是否成功执行 D1 migrations；
2. Pages Binding 是否为 `DB → st-nav`；
3. `D1_DATABASE_ID` 是否对应当前 D1；
4. Pages 的 `DB` Binding 是否绑定到同一个 D1；
5. `ADMIN_PASSWORD` 是否存在；
6. `SESSION_SECRET` 是否存在；
7. 最新 Pages Deployment 是否成功。

### 登录提示未配置管理员密码

进入：

```text
Pages → Settings → Variables and Secrets → Production
```

确认：

```text
ADMIN_PASSWORD
SESSION_SECRET
```

均已设置。

### 短链接收藏或导航收藏字段不存在

说明数据库 migration 没有全部执行。不要手工修改表结构，重新执行：

```bash
npm run deploy
```

不要手工 ALTER 表。

### CSS / JS 更新后浏览器仍显示旧界面

项目会为前台和后台资源使用缓存版本参数。发布新代码后，如果仍看到旧界面，可以强制刷新浏览器或清理站点缓存。

## 十、安全建议

- 使用强管理员密码。
- `SESSION_SECRET` 使用独立随机值，至少 32 个字符。
- 不要提交 `.dev.vars`。
- 正式环境建议配合 Cloudflare WAF / Rate Limiting 保护登录接口。
- Preview 环境建议使用独立 D1，避免测试数据进入生产库。
- 定期下载 JSON 数据备份。
- 不要删除或改写已经应用到生产数据库的 migration 文件。

## 十一、发布检查清单

部署前运行：

```bash
npm run doctor
```

数据库初始化/升级 + 部署：

```bash
npm run deploy
```

确认：

```text
□ D1 数据库已创建
□ D1_DATABASE_ID 已配置
□ DB binding 正确
□ migrations 自动执行
□ ADMIN_PASSWORD 已设置
□ SESSION_SECRET 已设置
□ npm run doctor 通过
□ Pages Deployment 成功
□ 首页可以访问
□ /admin.html 可以登录
□ 短链接可以创建并访问
□ 导航、收藏、启停、排序功能正常
```

## 十二、当前发布版本

### 1.0.0

当前正式项目版本。包含：

- Cloudflare Pages Advanced Mode + D1 架构
- 前台响应式个人导航
- 短链接创建、编辑、删除、搜索、排序、分页
- 短码实时可用性检查
- 短链接打开、复制、收藏、启停
- CSV 导入导出
- 导航排序、编辑、打开、复制、收藏、启停
- 导航批量选择与批量操作
- 移动端导航单列紧凑卡片
- PC / 移动端短链接管理布局优化
- JSON 数据备份与恢复
- 管理员 Session、登录限流及安全响应头
- D1 标准 migration 初始化与升级流程
