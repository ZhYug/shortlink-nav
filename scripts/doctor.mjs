#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};

console.log('🔎 ST Nav 1.0.0 Cloudflare Pages Dashboard + D1 检查\n');

const requiredFiles = [
  'package.json',
  'public/_worker.js',
  'scripts/worker.template.js',
  'scripts/build.mjs',
  'public/index.html',
  'public/admin.html',
  'public/.assetsignore',
  '.dev.vars.example',
  'migrations/0001_initial.sql',
  'migrations/0002_link_favorites.sql',
  'migrations/0003_navigation_favorites.sql',
  '.gitignore',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`缺少 ${file}`);
}

if (existsSync('wrangler.toml') || existsSync('wrangler.json') || existsSync('wrangler.jsonc')) {
  fail('Dashboard 版项目不应包含 Wrangler 项目配置文件；D1 Binding 应在 Cloudflare Pages Dashboard 管理。');
}

if (existsSync('.wrangler.deploy.toml')) {
  fail('发现临时 .wrangler.deploy.toml，请删除后再提交。');
}

const migrationChecks = [
  ['migrations/0001_initial.sql', /CREATE TABLE IF NOT EXISTS links/, '0001 缺少 links 初始表结构'],
  ['migrations/0002_link_favorites.sql', /ALTER TABLE links ADD COLUMN favorite/, '0002 缺少短链接收藏字段'],
  ['migrations/0003_navigation_favorites.sql', /ALTER TABLE navigation ADD COLUMN favorite/, '0003 缺少导航收藏字段'],
];
for (const [file, pattern, message] of migrationChecks) {
  if (existsSync(file) && !pattern.test(readFileSync(file, 'utf8'))) fail(message);
}

if (existsSync('package.json')) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.version !== '1.0.0') fail('package.json 版本号不是 1.0.0');
  if (pkg.scripts?.dev !== 'npm run build && wrangler pages dev public') fail('本地 dev 脚本未先生成 Worker');
  if (pkg.scripts?.build !== 'node scripts/build.mjs') fail('build 脚本未生成运行时 migration Worker');
  if (pkg.scripts?.deploy !== 'npm run build && wrangler pages deploy public --project-name st-nav') fail('CLI deploy 脚本配置异常');
  if (pkg.scripts?.['db:migrate:remote']) fail('Dashboard 版不应保留远程 Wrangler migration 脚本');
  console.log('✓ package.json / Dashboard Build 流程配置正确');
}

if (existsSync('public/.assetsignore')) {
  const ignore = readFileSync('public/.assetsignore', 'utf8');
  if (!/(^|\n)_worker\.js(\n|$)/.test(ignore)) fail('public/.assetsignore 未排除 _worker.js');
  console.log('✓ _worker.js 已从静态资产上传中排除');
}

if (existsSync('public/_worker.js')) {
  const worker = readFileSync('public/_worker.js', 'utf8');
  if (!worker.includes('const VERSION = "1.0.0"')) fail('Worker 版本号不是 1.0.0');
  if (!worker.includes('export default')) fail('Worker 未使用 Module Worker 语法');
  if (!worker.includes('env.ASSETS.fetch')) fail('Worker 未处理 Pages 静态资产请求');
  if (!worker.includes('__Host-stnav_session')) fail('Session Cookie 未启用 __Host- 前缀');
  if (!worker.includes('SESSION_SECRET')) fail('缺少独立 SESSION_SECRET 支持');
  if (!worker.includes('checkLoginRateLimit')) fail('缺少登录限流保护');
  if (!worker.includes('safePasswordMatch')) fail('管理员密码未使用固定长度摘要比较');
  if (!worker.includes('MAX_JSON_BODY_BYTES')) fail('缺少请求体大小限制');
  if (!worker.includes('new WeakMap')) fail('D1 初始化缓存未按环境隔离');
  if (!worker.includes('RUNTIME_MIGRATIONS')) fail('Worker 未嵌入运行时 migration');
  if (worker.includes('__RUNTIME_MIGRATIONS__')) fail('Worker 仍保留未构建的 migration 占位符');
  if (!worker.includes('_stnav_migrations')) fail('缺少运行时 migration 版本表');
  if (!worker.includes('await ensureDatabase(env)')) fail('缺少自动数据库初始化调用');
  if (/length\s*<\s*10/.test(worker) || /length\s*<\s*16/.test(worker)) fail('ADMIN_PASSWORD 仍存在最小长度限制');
  if (!worker.includes('if (!env.ADMIN_PASSWORD)')) fail('ADMIN_PASSWORD 空值检查缺失');
  console.log('✓ Pages Worker / 自动 D1 初始化检查通过');
}

if (process.exitCode) process.exit(process.exitCode);

console.log('\n✓ 项目检查完成');
console.log('ℹ️ Cloudflare Dashboard：只需创建 D1、绑定 DB，并设置 ADMIN_PASSWORD / SESSION_SECRET。');
console.log('ℹ️ Git 集成部署使用 Build command: npm run build；无需 D1_DATABASE_ID 或 Cloudflare API Token。');
console.log('ℹ️ 首次访问时 Worker 通过 DB Binding 自动执行 migrations；后续请求自动应用新增 migration。');
