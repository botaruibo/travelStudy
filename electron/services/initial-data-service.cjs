const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { bundledConfigDir, bundledInitialDataDir } = require('./runtime-paths.cjs');

async function copyDirectory(source, target) {
  if (!source || !fs.existsSync(source)) return;
  await fsp.mkdir(target, { recursive: true });
  await fsp.cp(source, target, { recursive: true, force: false, errorOnExist: false });
}

async function ensureBundledInitialData({ rootDir }) {
  const sourceDir = bundledInitialDataDir();
  if (!sourceDir) return;
  const databasePath = path.join(rootDir, 'travel-study.sqlite');
  if (!fs.existsSync(databasePath)) await copyDirectory(sourceDir, rootDir);

  const configSourceDir = bundledConfigDir();
  if (configSourceDir) await copyDirectory(configSourceDir, path.join(rootDir, 'config'));
}

function reconcileBundledInitialDataPaths({ db, storage, rootDir }) {
  const sourceDir = bundledInitialDataDir();
  if (!sourceDir || path.resolve(sourceDir) === path.resolve(rootDir)) return;

  storage.migrateDatabasePaths(db, [[sourceDir, rootDir]]);
  db.run(
    `UPDATE videos
     SET source_path = proxy_path
     WHERE id = 'sample-study-video'
       AND proxy_path IS NOT NULL
       AND (
         source_path IS NULL
         OR source_path = ''
         OR source_path = proxy_path
         OR source_path LIKE ?
       )`,
    [`${sourceDir}${path.sep}%`]
  );
}

module.exports = { ensureBundledInitialData, reconcileBundledInitialDataPaths };
