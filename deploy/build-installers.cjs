#!/usr/bin/env node
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectDir = path.resolve(__dirname, '..');
const builderConfig = path.join(projectDir, 'deploy', 'electron-builder.json');
const args = process.argv.slice(2);

const buildMac = args.includes('--mac') || !args.includes('--win');
const buildWin = args.includes('--win') || !args.includes('--mac');

function run(command, commandArgs, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('npm', ['run', 'build:renderer']);
run('node', ['scripts/prepare-initial-data.cjs'], { TRAVEL_STUDY_NO_MODEL_SECRETS: '1' });
if (buildMac) run('npx', ['electron-builder', '--config', builderConfig, '--publish', 'never', '--mac', 'pkg', '--arm64']);
if (buildWin) run('npx', ['electron-builder', '--config', builderConfig, '--publish', 'never', '--win', 'nsis', '--x64']);
