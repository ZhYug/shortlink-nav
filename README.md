# ShortLink Nav V3

Cloudflare Pages + Pages Functions + D1 的短链接 / 导航一体化项目。

## V3 更新

- 前台与后台统一玻璃拟态视觉系统
- Command/Ctrl + K 快速搜索
- 分类筛选
- 收藏（浏览器本地保存）
- 最近访问
- 自动 favicon
- 导航拖拽排序
- 短链接二维码
- 点击趋势（最近 14 天）
- 一键复制/导出 CSV
- CSV 批量导入
- 后台 Toast / 空状态 / 响应式移动端
- D1 `link_visits` 明细表用于趋势统计
- HttpOnly + Secure Session
- API 请求来源校验
- 短码只允许字母、数字、`_`、`-`

## 部署

1. 将仓库连接到 Cloudflare Pages，Framework preset 选择 None，Build command 留空，Build output directory 填 `public`。
2. 创建 D1：
   `npx wrangler d1 create shortlink-nav`
3. 将返回的 database_id 写入 `wrangler.toml`。
4. 执行：
   `npx wrangler d1 migrations apply shortlink-nav --remote`
5. 在 Pages 项目设置中创建 Secrets：
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
6. 绑定 D1，Binding 名称必须为 `DB`。
7. GitHub push 后由 Cloudflare 自动部署。

## 本地开发

复制 `.dev.vars.example` 为 `.dev.vars` 并修改密码，然后：

`npx wrangler pages dev public`

## 注意

二维码功能使用 jsDelivr 加载 `qrcode` 浏览器库；导航图标默认使用 Google favicon 服务。若希望完全无第三方依赖，可在后续版本改成自托管方案。
