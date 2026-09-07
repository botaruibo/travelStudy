#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('../electron/services/database.cjs');
const { StorageService } = require('../electron/services/storage.cjs');

const projectDir = path.resolve(__dirname, '..');
const defaultRoots = [
  path.join(process.env.HOME || '', 'Library', 'Application Support', '研学记', 'travel-study'),
  path.join(projectDir, '.runtime', 'dev-user-data', 'travel-study'),
];

async function migrateRoot(rootPath) {
  if (!fs.existsSync(rootPath)) {
    console.log(`跳过不存在的数据目录：${rootPath}`);
    return;
  }
  const db = new Database(path.join(rootPath, 'travel-study.sqlite'));
  await db.init();
  await new StorageService(rootPath).init({ db });
  await db.save();
  console.log(`已迁移：${rootPath}`);
}

async function main() {
  const roots = process.argv.slice(2).length
    ? process.argv.slice(2).map((item) => path.resolve(item))
    : defaultRoots;
  for (const rootPath of roots) await migrateRoot(rootPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
