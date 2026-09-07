#!/usr/bin/env node
process.env.TRAVEL_STUDY_NO_MODEL_SECRETS = '1';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Database } = require('../electron/services/database.cjs');
const { StorageService } = require('../electron/services/storage.cjs');
const { ensureSampleData, SAMPLE_VIDEO_ID } = require('../electron/services/sample-data.cjs');
const { ensureVolcenginePlanAsrConfig } = require('../electron/services/model-config.cjs');

const projectDir = path.resolve(__dirname, '..');
const rootPath = path.join(projectDir, 'resources', 'initial-data', 'travel-study');
const sampleVideoPath = path.join(projectDir, 'example', 'sample-study.mp4');
const configSourceDir = path.join(projectDir, 'electron', 'config');

async function main() {
  if (!fs.existsSync(sampleVideoPath)) throw new Error(`示例视频不存在：${sampleVideoPath}`);
  await fsp.rm(rootPath, { recursive: true, force: true });

  const db = new Database(path.join(rootPath, 'travel-study.sqlite'));
  await db.init();
  const storage = await new StorageService(rootPath).init({ db });
  await ensureVolcenginePlanAsrConfig(db);
  await ensureSampleData({ db, storage, sampleVideoPath });

  const proxyPath = storage.proxyPath(SAMPLE_VIDEO_ID);
  await storage.ensureParent(proxyPath);
  await fsp.copyFile(sampleVideoPath, proxyPath);
  const proxyStat = await fsp.stat(proxyPath);
  await db.run(
    'UPDATE videos SET proxy_path = ?, source_path = ?, source_size = ?, source_mtime = ? WHERE id = ?',
    [proxyPath, proxyPath, proxyStat.size, proxyStat.mtime.toISOString(), SAMPLE_VIDEO_ID]
  );

  await fsp.mkdir(path.join(rootPath, 'config'), { recursive: true });
  for (const entry of await fsp.readdir(configSourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    await fsp.copyFile(path.join(configSourceDir, entry.name), path.join(rootPath, 'config', entry.name));
  }

  await fsp.mkdir(path.join(rootPath, 'pdf-notes', 'fragments'), { recursive: true });
  await fsp.mkdir(path.join(rootPath, 'pdf-notes', 'notes'), { recursive: true });
  await db.save();
  console.log(`已生成安装包初始数据：${rootPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
