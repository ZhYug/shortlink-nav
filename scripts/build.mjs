#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'migrations');
const templatePath = path.join(root, 'scripts', 'worker.template.js');
const workerPath = path.join(root, 'public', '_worker.js');

const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((file) => {
    const match = file.match(/^(\d+)_/);
    return {
      id: match[1].padStart(4, '0'),
      file,
      sql: readFileSync(path.join(migrationsDir, file), 'utf8').trim(),
    };
  });

if (!migrations.length) throw new Error('migrations/ 中没有找到 SQL migration');

let worker = readFileSync(templatePath, 'utf8');
const marker = /const RUNTIME_MIGRATIONS = __RUNTIME_MIGRATIONS__;/;
if (!marker.test(worker)) throw new Error('scripts/worker.template.js 缺少 RUNTIME_MIGRATIONS 构建占位符');

worker = worker.replace(marker, `const RUNTIME_MIGRATIONS = ${JSON.stringify(migrations, null, 2)};`);
writeFileSync(workerPath, worker);

console.log(`✓ 已生成 public/_worker.js，并嵌入 ${migrations.length} 个 D1 migration`);
for (const migration of migrations) console.log(`  - ${migration.file}`);
