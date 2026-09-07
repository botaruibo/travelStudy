#!/usr/bin/env node
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectDir = path.resolve(__dirname, '..');
const releaseDir = path.join(projectDir, 'release');
const verifyRoot = path.join(projectDir, '.runtime', 'deploy-verify', 'macos');
const installDir = path.join(verifyRoot, 'Applications');
const tempHome = path.join(verifyRoot, 'home');
const tempTmp = path.join(verifyRoot, 'tmp');
const expandedPkgDir = path.join(verifyRoot, 'expanded-pkg');
const isolatedRootDir = path.join(verifyRoot, 'user-data', 'travel-study');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败：${result.stderr || result.stdout}`.trim());
  }
  return result.stdout.trim();
}

function newestPkg() {
  const files = fs.readdirSync(releaseDir)
    .filter((name) => name.endsWith('.pkg'))
    .map((name) => {
      const filePath = path.join(releaseDir, name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!files.length) throw new Error('未找到 macOS pkg 安装包，请先运行 npm run build:installers:mac');
  return files[0].filePath;
}

function findAppBundle(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const match = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  if (!match) throw new Error(`在 ${rootDir} 中未找到 .app`);
  return path.join(rootDir, match.name);
}

function findExecutable(appBundlePath) {
  const macOsDir = path.join(appBundlePath, 'Contents', 'MacOS');
  const entries = fs.readdirSync(macOsDir, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile());
  if (!match) throw new Error(`在 ${macOsDir} 中未找到可执行文件`);
  return path.join(macOsDir, match.name);
}

function findInstalledRoot(startDir) {
  if (!fs.existsSync(startDir)) return '';
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    const databasePath = path.join(current, 'travel-study.sqlite');
    if (fs.existsSync(databasePath)) return current;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
    }
  }
  return '';
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('仅支持在 macOS 上验证 pkg 安装包');
  if (!fs.existsSync(releaseDir)) throw new Error('release 目录不存在，请先运行 npm run build:installers:mac');

  const pkgPath = newestPkg();
  const builtApp = path.join(releaseDir, 'mac-arm64', 'TravelStudy.app');
  if (!fs.existsSync(builtApp)) throw new Error('未找到已构建的 TravelStudy.app');
  await fsp.rm(verifyRoot, { recursive: true, force: true });
  await Promise.all([
    fsp.mkdir(installDir, { recursive: true }),
    fsp.mkdir(tempHome, { recursive: true }),
    fsp.mkdir(tempTmp, { recursive: true }),
  ]);

  run('pkgutil', ['--expand-full', pkgPath, expandedPkgDir]);

  let child;
  try {
    const installedApp = path.join(installDir, path.basename(builtApp));
    await fsp.cp(builtApp, installedApp, { recursive: true });

    const executable = findExecutable(installedApp);
    child = spawn(executable, [], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        HOME: tempHome,
        TMPDIR: tempTmp,
        TRAVEL_STUDY_USER_DATA_ROOT: isolatedRootDir,
      },
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const rootDir = fs.existsSync(path.join(isolatedRootDir, 'travel-study.sqlite'))
      ? isolatedRootDir
      : findInstalledRoot(path.join(tempHome, 'Library', 'Application Support'));
    if (!rootDir) throw new Error('应用首次启动后未生成初始化数据库');

    process.env.TRAVEL_STUDY_CONFIG_DIR = path.join(rootDir, 'config');
    const { AppService } = require(path.join(projectDir, 'electron', 'services', 'app-service.cjs'));
    const service = new AppService({
      rootDir,
      sampleVideoPath: '',
      legacyDbPath: path.join(rootDir, 'travel-study.sqlite'),
      onTaskUpdate: () => {},
    });
    await service.init();
    const session = service.login('超级奶妈', 'cjnmixx');
    if (!session?.user?.id) throw new Error('默认普通用户登录失败');

    const videos = service.listVideos();
    const notes = service.listNotes();
    const credits = service.getCreditSummary();
    const modelConfigRow = service.db.get('SELECT value_json FROM system_config WHERE config_key = ?', ['AIConfig']);

    if (!videos.find((video) => video.id === 'sample-study-video' && video.proxy_path && fs.existsSync(video.proxy_path))) {
      throw new Error('初始化后缺少样例视频');
    }
    if (!notes.find((note) => note.id === 'sample-study-note' && note.exists)) {
      throw new Error('初始化后缺少样例笔记');
    }
    if (!credits?.account || Number(credits.account.balanceUnits) <= 0) {
      throw new Error('初始化后缺少积分账户或余额');
    }
    for (const fileName of ['prompts.json', 'redeem-public-key.pem']) {
      if (!fs.existsSync(path.join(rootDir, 'config', fileName))) throw new Error(`初始化后缺少配置文件 ${fileName}`);
    }
    if ((modelConfigRow?.value_json || '').includes('apiKeyEncrypted') || (modelConfigRow?.value_json || '').includes('"apiKey"')) {
      throw new Error('初始化数据中不应包含 AI 模型秘钥');
    }

    console.log(`macOS 安装验证通过：${path.basename(pkgPath)}`);
    console.log(`应用安装目录：${installedApp}`);
    console.log(`初始化数据目录：${rootDir}`);
  } finally {
    if (child?.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { try { process.kill(child.pid, 'SIGTERM'); } catch {} }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
