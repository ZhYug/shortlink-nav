#!/usr/bin/env node
import { rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const databaseId = process.env.D1_DATABASE_ID?.trim();
const generated = path.join(root, '.wrangler.deploy.toml');

if (!databaseId) {
  console.error('✗ 缺少 D1_DATABASE_ID。');
  process.exit(1);
}
if (!/^[0-9a-fA-F-]{36}$/.test(databaseId)) {
  console.error('✗ D1_DATABASE_ID 格式无效，应为 Cloudflare D1 database UUID。');
  process.exit(1);
}

writeFileSync(generated, `name = "st-nav"\npages_build_output_dir = "./public"\ncompatibility_date = "2026-09-11"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "st-nav"\ndatabase_id = "${databaseId}"\nmigrations_dir = "./migrations"\n` , { mode: 0o600 });

try {
  const result = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', generated], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} finally {
  rmSync(generated, { force: true });
}
