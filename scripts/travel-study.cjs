#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectDir = path.resolve(__dirname, '..');
const runtimeDir = path.join(projectDir, '.runtime');
const pidFile = path.join(runtimeDir, 'dev.pid');

const isRunning = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
};
const readPid = () => { try { return Number(fs.readFileSync(pidFile, 'utf8').trim()); } catch { return 0; } };
const clearPid = () => { try { fs.rmSync(pidFile, { force: true }); } catch {} };

function stop() {
  const pid = readPid();
  if (!pid || !isRunning(pid)) { clearPid(); console.log('研学笔记未在运行'); return; }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
  clearPid();
  console.log(`已停止 Vite 和 Electron（进程组 ${pid}）`);
}

function start() {
  const oldPid = readPid();
  if (oldPid && isRunning(oldPid)) { console.log(`研学笔记已在运行（进程组 ${oldPid}）`); return; }
  fs.mkdirSync(runtimeDir, { recursive: true });
  const logPath = path.join(runtimeDir, 'dev.log');
  const log = fs.openSync(logPath, 'a');
  const child = spawn('npm', ['run', 'dev'], { cwd: projectDir, detached: true, stdio: ['ignore', log, log], env: process.env });
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  console.log(`已启动 Vite 和 Electron（进程组 ${child.pid}）`);
  console.log(`日志：${logPath}`);
}

function status() {
  const pid = readPid();
  if (pid && isRunning(pid)) console.log(`运行中：Vite + Electron（进程组 ${pid}）`);
  else { clearPid(); console.log('未运行'); }
}

const command = process.argv[2] || 'start';
if (['stop', 'pause', '退出', '暂停'].includes(command)) stop();
else if (['status', '状态'].includes(command)) status();
else if (['restart', '重启'].includes(command)) { stop(); start(); }
else if (['start', '启动'].includes(command)) start();
else { console.error('用法：npm run app -- start|pause|restart|status'); process.exitCode = 1; }
