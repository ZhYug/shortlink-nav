# ST Nav

ST Nav 是一个基于 Cloudflare Pages + D1 的个人导航与短链接管理系统。

## 项目功能

- 导航站点管理
- 短链接创建与跳转
- 导航和短链接收藏
- 管理后台
- D1 数据库存储
- 首次访问自动创建数据表并初始化数据
- 后续新增数据库 Migration 自动执行
- 支持 Cloudflare Pages GitHub 自动部署

## 第一次部署

### 1. 上传项目到 GitHub

将整个项目上传到自己的 GitHub Repository，例如：

```text
st-nav
```

默认使用 `main` 分支。

### 2. 创建 Cloudflare D1 数据库

进入 Cloudflare Dashboard：

**Workers & Pages → D1 → Create database**

创建一个新的 D1 数据库，例如：

```text
st-nav
```

只需要创建数据库资源即可。

**不要手动创建数据表，也不要手动执行 SQL。**

### 3. 创建 Cloudflare Pages 项目

进入：

**Workers & Pages → Create application → Pages → Connect to Git**

选择 GitHub，并选择刚刚创建的 Repository。

### 4. 配置构建设置

设置：

| 配置 | 值 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | `/` |

然后点击 **Save and Deploy**。

### 5. 配置 D1 Binding

部署完成后，进入：

**Workers & Pages → 你的项目 → Settings → Bindings**

添加 **D1 database binding**：

| 配置 | 值 |
|---|---|
| Variable name | `DB` |
| D1 database | 选择刚刚创建的 `st-nav` |

保存配置。

### 6. 配置环境变量

进入：

**Settings → Variables and Secrets**

在 Production 环境添加：

```text
ADMIN_PASSWORD=你的管理员密码
SESSION_SECRET=随机且足够长的字符串
```

例如：

```text
ADMIN_PASSWORD=your-strong-password
SESSION_SECRET=change-this-to-a-long-random-secret
```

`SESSION_SECRET` 建议使用随机生成的长字符串。

### 7. 重新部署

完成 D1 Binding 和环境变量配置后，进入：

**Deployments → Retry deployment**

或者向 GitHub `main` 分支提交一次新的 Commit，让 Cloudflare Pages 自动重新部署。

### 8. 自动初始化数据库

重新部署后，第一次访问需要使用数据库的页面/API 时，系统会自动：

1. 创建 Migration 记录表
2. 执行项目中的数据库 Migration
3. 创建业务数据表和索引
4. 写入初始数据
5. 记录已经执行的 Migration

因此第一次部署**不需要手动执行 SQL**。

以后项目新增：

```text
migrations/0004_xxx.sql
migrations/0005_xxx.sql
```

系统会按照编号自动执行尚未执行的 Migration。

### 9. 登录管理后台

打开你的 Cloudflare Pages 域名：

```text
https://你的项目.pages.dev
```

管理后台：

```text
https://你的项目.pages.dev/admin.html
```

使用部署时设置的 `ADMIN_PASSWORD` 登录。

## 注意

项目不需要配置以下变量：

```text
D1_DATABASE_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

D1 数据库只需要在 Cloudflare Dashboard 中创建一次，并通过 `DB` Binding 提供给 Worker。
