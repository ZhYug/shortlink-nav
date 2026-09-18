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

本项目专门适配 **Cloudflare Pages + GitHub 集成 + D1 Binding**。

核心目标是：**仓库不保存 D1 `database_id`，Cloudflare Dashboard 不需要配置 `D1_DATABASE_ID`，也不需要在项目中保存 Cloudflare API Token。**

### 1. 上传 GitHub

将整个项目目录上传到 GitHub，例如仓库名：`st-nav`。

推荐生产分支：`main`。

### 2. 创建 D1（第一次只做一次）

在 Cloudflare Dashboard 创建 D1 数据库：

```text
Workers & Pages → D1 → Create database
```

数据库名称建议：

```text
st-nav
```

这一步只是创建 Cloudflare 的 D1 资源，**不需要手动创建表，也不需要导入 SQL。**

### 3. Pages 绑定 D1

创建 Pages 项目后进入：

```text
Pages 项目 → Settings → Bindings → Add → D1 database
```

填写：

```text
Variable name: DB
D1 database: st-nav
```

**变量名必须是 `DB`。**

Cloudflare Pages 的 D1 binding 负责让运行中的 Worker 访问这个数据库；仓库本身不保存真实 `database_id`。

### 4. Cloudflare Dashboard 的 GitHub 构建设置

第一次连接 GitHub 时填写：

```text
Project name:
shortlink-nav

Production branch:
main

Framework preset:
None

Build command:
npm run build

Build output directory:
public

Root directory:
/
```

**不要填写 `npm run deploy`。**

`npm run deploy` 是给本地 Wrangler CLI 使用的；Cloudflare Pages Git 集成已经负责最终的 Pages 部署，如果再调用 `wrangler pages deploy` 会形成重复部署。

### 5. 配置生产环境变量 / Secret

只需要配置应用运行时需要的变量：

```text
ADMIN_PASSWORD=你的管理员密码
SESSION_SECRET=随机高熵字符串
```

**不需要配置：**

```text
D1_DATABASE_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

### 6. 数据库初始化是自动的

这里是本项目和普通静态 Pages 项目的主要区别。

Cloudflare Pages 的 GitHub Build 本身不能在没有 Cloudflare 控制面认证的情况下直接执行远程 `wrangler d1 migrations apply --remote`；D1 Wrangler 命令通过 Cloudflare API 操作控制面。为了实现你要求的“仓库零 API Token”，本项目把 migration 执行器放进 Pages Worker，通过已经绑定的 `DB` D1 Binding 完成初始化。Cloudflare D1 Worker API 支持直接执行 SQL，`batch()` 还是事务性的；`exec()` 也支持多条 SQL，但本项目使用 `batch()` 执行实际 migration。 citeturn0search1turn0search12

第一次真正访问网站/API 时：

```text
访问网站
   ↓
Worker 获得 DB Binding
   ↓
创建 _stnav_migrations 版本表
   ↓
检查 0001 / 0002 / 0003
   ↓
执行尚未完成的 migration
   ↓
创建业务表 + 索引
   ↓
插入默认设置 + 默认导航数据
   ↓
记录 migration 已完成
```

因此你**不需要进入 D1 Console 手工初始化表或插入数据**。

### 7. 后续更新也是自动的

以后增加：

```text
migrations/0004_add_xxx.sql
```

提交 GitHub 后 Cloudflare 自动构建部署。

新版本 Worker 启动后会检查 `_stnav_migrations`：

```text
0001 → 已完成 → 跳过
0002 → 已完成 → 跳过
0003 → 已完成 → 跳过
0004 → 未完成 → 自动执行
```

因此数据库结构和初始数据会跟着代码版本增量更新。

> 重要：不要修改已经在生产环境执行过的 migration。数据库结构变更请始终新增 `0004`、`0005` 等 migration。

## 四、本地开发

安装依赖后：

```bash
npm install
npm run dev
```

构建 Worker 时会自动把 `migrations/*.sql` 嵌入 Pages Worker：

```bash
npm run build
```

生产环境的 D1 使用 Cloudflare Pages 的 `DB` Binding；本地 Wrangler D1 可以使用独立的本地数据库进行测试。

## 五、CLI 部署（可选）

如果你不使用 Cloudflare GitHub 集成，而是在自己的电脑上直接部署，可以：

```bash
npx wrangler login
npm run deploy
```

这个命令执行标准 Pages 部署：

```text
npm run build
      ↓
生成 public/_worker.js
      ↓
wrangler pages deploy public
```

运行时仍然会通过 D1 Binding 自动初始化/升级数据库。

如果你确实希望在 CLI 部署前就直接执行 Cloudflare 远程 migration，也可以使用：

```bash
D1_DATABASE_ID=你的D1数据库UUID npm run db:migrate:remote
```

但这属于**可选的、需要 Cloudflare 控制面认证的运维方式**，Cloudflare Dashboard GitHub 部署不依赖它。

## 六、数据库与首次部署说明

### 空数据库

新建 D1 后，**不要手工执行 SQL**。

只需要：

```text
创建 D1
  ↓
Pages 绑定 DB
  ↓
GitHub 部署
  ↓
首次请求自动初始化
```

当前 migration：

```text
migrations/0001_initial.sql
migrations/0002_link_favorites.sql
migrations/0003_navigation_favorites.sql
```

`0001` 会创建业务表、索引、默认设置和默认导航数据；`0002`、`0003` 会继续添加收藏字段。

### 已有数据库

不要删除数据库，也不要重新执行旧 migration。

直接提交新的 migration：

```text
migrations/0004_xxx.sql
```

然后正常 GitHub 部署即可。

### Worker 的数据库初始化

Worker 会在第一次需要数据库的请求中自动初始化数据库，并使用 `_stnav_migrations` 保存应用过的 migration 编号。

如果数据库初始化失败，当前请求会返回错误；修复部署问题后再次请求即可继续初始化。已经成功完成的 migration 不会重复执行。

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

1. Cloudflare Pages 是否成功完成 Build；
2. Pages 的 `DB` Binding 是否绑定到正确的 D1；
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

说明 Worker 尚未完成运行时 migration。不要手工修改表结构。

重新访问首页或 `/api/health`，Worker 会继续执行尚未完成的 migration。

如果仍失败，请查看 Pages Functions 日志。

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

构建检查：

```bash
npm run build
```

Cloudflare GitHub 集成部署使用 Dashboard 中的 Build command：`npm run build`。数据库初始化/升级由 Pages Worker 通过 `DB` Binding 自动完成。

确认：

```text
□ D1 数据库已创建
□ DB binding 正确
□ 首次请求自动初始化 migrations
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
