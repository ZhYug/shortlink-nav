#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const databaseId = process.env.D1_DATABASE_ID?.trim();
const generated = path.join(root, '.wrangler.deploy.toml');

if (!databaseId) {
  console.error('✗ 缺少 D1_DATABASE_ID。请在 Cloudflare Pages 环境变量或当前终端设置 D1_DATABASE_ID。');
  process.exit(1);
}

if (!/^[0-9a-fA-F-]{36}$/.test(databaseId)) {
  console.error('✗ D1_DATABASE_ID 格式无效，应为 Cloudflare D1 database UUID。');
  process.exit(1);
}

const config = `name = "st-nav"\npages_build_output_dir = "./public"\ncompatibility_date = "2026-09-11"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "st-nav"\ndatabase_id = "${databaseId}"\nmigrations_dir = "./migrations"\n\n[observability]\nenabled = true\n\n[vars]\nST_NAV_VERSION = "1.0.0"\n`;

writeFileSync(generated, config, { mode: 0o600 });

const run = (args) => {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

try {
  console.log('🗄️  应用远程 D1 migrations（只执行尚未应用的迁移）...');
  run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', generated]);

  console.log('🚀 部署 Cloudflare Pages...');
  run(['pages', 'deploy', 'public', '--config', generated]);

  console.log('✓ D1 migration + Pages deploy 完成');
} finally {
  try { rmSync(generated, { force: true }); } catch {}
}
