# ST Nav 1.0.0

ST Nav 是一个基于 **Cloudflare Pages Advanced Mode + D1** 的个人导航与短链接管理系统。

---

## 一、项目使用说明

### 1. 前台导航

访问网站首页即可使用导航功能：

- 分类导航卡片
- 站点搜索
- 收藏
- 最近访问
- 自定义站点标题、副标题、首页文案
- SEO 描述与强调色
- 移动端、平板、PC、大屏布局设置
- 分类隐藏、排序及标签样式

### 2. 管理后台

访问：

```text
/admin.html
```

使用 Cloudflare Pages 中配置的 `ADMIN_PASSWORD` 登录。

后台提供：

#### 短链接管理

- 创建、编辑、删除短链接
- 自定义短码或自动生成短码
- 短码可用性检查
- 启用 / 停用
- 收藏
- 搜索、排序、分类筛选、分页
- 批量启用、停用、删除
- 批量加入导航、移出导航
- 打开、复制短链接
- CSV 导入 / 导出

#### 导航管理

- 创建、编辑、删除导航项目
- 上移、下移及保存排序
- 打开、复制链接
- 收藏 / 取消收藏
- 启用 / 停用
- 批量选择及批量操作
- 与关联短链接同步收藏及启停状态

#### 数据管理

- CSV 导入 / 导出
- JSON 完整备份
- JSON 合并恢复
- JSON 完全覆盖恢复
- 备份包含短链接、导航、设置及点击统计

---

## 二、项目实现功能

### 前端

- Cloudflare Pages Advanced Mode
- 响应式导航界面
- PC / 平板 / 手机布局
- 搜索、收藏、最近访问
- Service Worker / PWA 基础支持
- 管理后台独立页面

### Worker

- Pages Advanced Mode `_worker.js`
- 静态资源通过 `env.ASSETS` 提供
- API 路由
- 管理员 Session 登录
- 登录限流
- 安全响应头
- 短链接跳转
- D1 数据库访问

### D1 数据库

数据库结构通过 `migrations/` 版本化管理：

```text
migrations/
├── 0001_initial.sql
├── 0002_link_favorites.sql
└── 0003_navigation_favorites.sql
```

首次使用空 D1 时，Worker 会通过已经配置的 `DB` Binding 自动：

1. 创建 migration 记录表；
2. 按顺序执行尚未执行的 migration；
3. 创建业务表和索引；
4. 插入初始设置及默认导航数据；
5. 记录已经完成的 migration。

以后新增：

```text
migrations/0004_xxx.sql
```

重新部署并访问项目后，只会执行尚未完成的 migration，不会重复执行已经完成的 migration。

**不要修改或删除已经在生产数据库执行过的 migration。数据库结构变化请新增 migration。**

---

# 三、Cloudflare Dashboard 完整部署教程

本项目推荐使用：

```text
GitHub
  ↓
Cloudflare Pages
  ↓
Cloudflare Dashboard 配置 D1 Binding
  ↓
GitHub 自动构建
  ↓
Worker 自动初始化 / 更新 D1
```

整个部署流程**不需要把 Cloudflare API Token 放进 GitHub 项目，也不需要配置 `D1_DATABASE_ID`**。

> 注意：D1 数据库资源本身需要在 Cloudflare Dashboard 创建一次。创建的是一个空数据库，不需要手动建表或执行 SQL。

---

## 第一步：准备 GitHub 仓库

把整个项目上传到 GitHub。

推荐：

```text
Production branch:
main
```

仓库根目录应该直接包含：

```text
public/
migrations/
scripts/
package.json
.gitignore
.nvmrc
```

不要再额外套一层项目目录。

例如正确：

```text
github.com/你的账号/st-nav
├── public/
├── migrations/
├── scripts/
└── package.json
```

而不是：

```text
github.com/你的账号/st-nav
└── st-nav/
    ├── public/
    ├── migrations/
    └── package.json
```

---

## 第二步：创建 Cloudflare D1 数据库

登录 Cloudflare Dashboard。

进入：

```text
Workers & Pages
→ D1
```

或者在 Cloudflare 的存储 / 数据库入口进入 D1。

点击：

```text
Create database
```

数据库名称建议：

```text
st-nav
```

创建完成即可。

### 重要

这里**不要**：

- 手动创建表
- 手动执行 `CREATE TABLE`
- 手动执行 migration SQL
- 手动导入初始数据

保持数据库为空即可。

本项目会在第一次运行时自动初始化。

---

# 四、创建 Cloudflare Pages 项目

进入：

```text
Workers & Pages
→ Create application
→ Pages
→ Connect to Git
```

选择：

```text
GitHub
```

授权 Cloudflare 访问 GitHub 后，选择你的 `st-nav` 仓库。

---

## 五、Cloudflare Pages 构建设置

本版本已经加入项目根目录的 `wrangler.toml`，由它声明 Cloudflare Pages 的静态资源目录：

```toml
pages_build_output_dir = "./public"
```

因此，使用 **Pages + GitHub** 创建项目时，不再需要手动填写 Build Command / Build output directory。

创建项目时：

### Project name

例如：

```text
st-nav
```

### Production branch

```text
main
```

### Framework preset

```text
None
```

### Build command

**留空，不填写。**

### Build output directory

**留空，不填写。**

### Root directory

```text
/
```

然后直接进入环境变量配置并点击：

```text
Save and Deploy
```

Cloudflare 会读取仓库中的：

```text
wrangler.toml
```

并使用：

```text
public/
```

作为 Pages 的部署目录。

> 注意：`public/` 仍然是项目实际的 Pages 输出目录，只是现在由 `wrangler.toml` 管理，不需要在第一次创建 Pages 项目时手工填写。

本项目不依赖 `npm run build` 才能完成第一次 Pages 部署。`public/_worker.js` 已经是可直接部署的 Pages Advanced Mode Worker。

# 六、第一次部署

点击：

```text
Save and Deploy
```

Cloudflare 会从 GitHub 拉取代码并执行：

```bash
npm run build
```

构建完成后部署 `public`。

第一次部署时，**先让网站完成一次成功部署即可**。

---

# 七、配置 D1 Binding

第一次 Pages 部署完成后进入你的 Pages 项目：

```text
Settings
→ Bindings
```

找到 D1 database。

点击：

```text
Add
```

选择：

```text
D1 database
```

配置：

```text
Variable name:
DB
```

然后选择刚才创建的：

```text
st-nav
```

最终关系必须是：

```text
DB → st-nav
```

### 变量名必须是 `DB`

项目 Worker 使用：

```text
env.DB
```

访问 D1。

因此不要使用：

```text
DATABASE
D1
DB1
MY_DB
```

除非同时修改项目代码。

### 如果出现：

```text
Another variable with this name already exists in this worker.
```

说明项目已经存在名为 `DB` 的变量 / Binding。

这时不要再次创建 `DB`。

检查当前 Bindings，确认已有的 `DB` 是否已经指向正确的 D1。

### 如果出现：

```text
Bindings for this project are being managed through wrangler.toml.
```

说明当前 Cloudflare Pages 项目仍然由旧的 Wrangler 配置管理。

本项目当前代码不依赖 `wrangler.toml` 管理生产 D1 Binding。

确认 GitHub 最新版本已经部署后，再检查 Bindings。

如果旧 Pages 项目仍持续锁定 Wrangler 配置管理，建议新建一个 Pages 项目重新连接当前 GitHub 仓库。

---

# 八、配置生产环境变量

进入：

```text
Settings
→ Variables and Secrets
```

选择：

```text
Production
```

添加：

### ADMIN_PASSWORD

```text
ADMIN_PASSWORD=你的管理员密码
```

这是后台登录密码。

### SESSION_SECRET

设置一个随机、高强度的字符串，例如至少 32 个字符。

```text
SESSION_SECRET=一串随机高强度字符串
```

### 本项目不需要配置

不要添加：

```text
D1_DATABASE_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

项目不把 D1 `database_id` 放进代码仓库。

---

# 九、重新部署让 Binding 生效

添加或修改 D1 Binding 后，重新部署项目。

可以在 Cloudflare Pages：

```text
Deployments
→ Retry deployment
```

或者向 GitHub `main` 推送新的 commit，让 Cloudflare 自动构建。

Cloudflare Pages Binding 修改后，应重新部署，使新的 Binding 出现在 Worker 运行环境。

---

# 十、自动初始化数据库

这是本项目的核心功能。

完成：

```text
D1 创建
+
DB Binding
+
ADMIN_PASSWORD
+
SESSION_SECRET
+
Pages 部署
```

以后，不需要打开 D1 Console 创建表。

第一次访问：

```text
https://你的域名/
```

Worker 会获得：

```text
env.DB
```

然后检查 migration 状态。

如果数据库是全新的：

```text
_stnav_migrations
       ↓
0001_initial.sql
       ↓
0002_link_favorites.sql
       ↓
0003_navigation_favorites.sql
```

自动执行。

完成后数据库会包含项目运行所需要的表、索引、设置及初始导航数据。

---

# 十一、如何确认数据库初始化成功

部署完成后访问：

```text
/
```

或者：

```text
/api/health
```

如果 Worker 正常运行并且 D1 Binding 正确，数据库初始化会自动完成。

然后进入：

```text
/admin.html
```

使用：

```text
ADMIN_PASSWORD
```

登录。

检查：

- 导航是否正常显示
- 短链接管理是否正常
- 设置是否正常
- 收藏是否正常
- 创建短链接是否正常

---

# 十二、以后如何更新数据库

不要手工进入 D1 Console 修改生产表结构。

例如需要新增字段：

```text
migrations/0004_add_xxx.sql
```

内容例如：

```sql
ALTER TABLE links ADD COLUMN example TEXT;
```

然后：

```text
GitHub
  ↓
git push
  ↓
Cloudflare Pages 自动构建
  ↓
Worker 更新
  ↓
首次请求检查 migration
  ↓
发现 0004 尚未执行
  ↓
自动执行 0004
```

已经完成的：

```text
0001 → 跳过
0002 → 跳过
0003 → 跳过
```

只有：

```text
0004 → 执行
```

---

# 十三、Migration 规则

必须遵守：

### 正确

```text
0001_initial.sql
0002_link_favorites.sql
0003_navigation_favorites.sql
0004_add_xxx.sql
0005_add_yyy.sql
```

### 不要

修改已经部署过的：

```text
0001_initial.sql
```

或者：

```text
0002_link_favorites.sql
```

### 正确的数据库更新方式

永远新增：

```text
0004_xxx.sql
```

而不是修改：

```text
0003_navigation_favorites.sql
```

这样可以保证不同环境的数据库版本一致。

---

# 十四、前台使用

打开：

```text
/
```

可以：

- 浏览分类
- 搜索站点
- 收藏站点
- 查看最近访问
- 打开导航
- 打开短链接

---

# 十五、后台使用

打开：

```text
/admin.html
```

登录后可以管理：

### 短链接

```text
创建
编辑
删除
启用
停用
收藏
搜索
排序
筛选
分页
批量操作
CSV 导入
CSV 导出
```

### 导航

```text
创建
编辑
删除
排序
收藏
启用
停用
批量操作
```

### 数据

```text
JSON 备份
JSON 合并恢复
JSON 完全覆盖恢复
CSV 导入 / 导出
```

---

# 十六、数据备份建议

生产环境建议定期进入：

```text
/admin.html
→ 系统管理
→ 数据管理
```

下载 JSON 备份。

尤其是在：

- 大量修改导航前
- 执行数据恢复前
- 大版本更新前
- 修改数据库 migration 前

先保存一份备份。

---

# 十七、常见问题

## 1. 页面能打开，但后台提示数据库错误

依次检查：

```text
□ D1 是否已经创建
□ Pages → Settings → Bindings 是否存在 DB
□ DB 是否绑定到正确的 D1
□ ADMIN_PASSWORD 是否设置
□ SESSION_SECRET 是否设置
□ Binding 修改后是否重新部署
```

---

## 2. 登录失败

检查：

```text
Settings
→ Variables and Secrets
→ Production
```

确认：

```text
ADMIN_PASSWORD
SESSION_SECRET
```

已经设置。

修改 Secret 后重新部署。

---

## 3. 数据库表不存在

不要手工执行 SQL。

先：

```text
重新部署
```

然后访问：

```text
/
```

或者：

```text
/api/health
```

Worker 会继续执行尚未完成的 migration。

---

## 4. 某个 migration 执行失败

不要删除数据库。

检查 Cloudflare Pages / Worker 日志。

修复代码或 migration 后重新部署并再次访问。

已经成功执行的 migration 不会重复执行。

---

## 5. Cloudflare 提示 DB 变量重复

如果看到：

```text
Another variable with this name already exists in this worker.
```

说明 `DB` 已经存在。

检查：

```text
Settings
→ Bindings
```

确认现有：

```text
DB
```

是否已经指向正确的 D1。

不要创建：

```text
DB2
```

来替代，除非同步修改 Worker 代码。

---

## 6. Cloudflare 提示由 wrangler.toml 管理 Bindings

当前版本本来就包含：

```text
wrangler.toml
```

其中：

```toml
pages_build_output_dir = "./public"
```

用于告诉 Cloudflare Pages 使用 `public/` 作为部署目录。

这不会要求你把 `D1_DATABASE_ID` 放进仓库。D1 仍然可以通过：

```text
Pages
→ Settings
→ Bindings
→ D1 database
→ Variable name: DB
```

绑定。

如果 Cloudflare 要求重新部署才能应用 Binding，执行一次新的 GitHub commit / Retry deployment 即可。
