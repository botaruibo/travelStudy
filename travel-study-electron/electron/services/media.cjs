const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const ffmpegStaticPath = require('ffmpeg-static');
let installerPath = null;
try { installerPath = require('@ffmpeg-installer/ffmpeg').path; } catch { /* optional fallback */ }
const ffmpegPath = process.env.FFMPEG_BIN || installerPath || ffmpegStaticPath;
const ffprobePath = require('ffprobe-static').path;

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`${binary} exited with ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function probeDuration(inputPath) {
  const { stderr } = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', inputPath]);
  const match = stderr.match(/\{[\s\S]*\}/);
  if (!match) return 0;
  try { return Number(JSON.parse(match[0]).format?.duration || 0); } catch { return 0; }
}

async function probeDurationSafe(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', inputPath], { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', () => resolve(0));
    child.on('close', () => {
      try { resolve(Number(JSON.parse(stdout).format?.duration || 0)); } catch { resolve(0); }
    });
  });
}

async function compressVideo(inputPath, outputPath) {
  await fs.mkdir(require('node:path').dirname(outputPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=w=min\\(1280\\,iw\\):h=-2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outputPath,
  ]);
  return outputPath;
}

async function extractAudio(videoPath, audioPath) {
  await fs.mkdir(require('node:path').dirname(audioPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', audioPath,
  ]);
  return audioPath;
}

async function extractFrame(videoPath, timestampSec, outputPath) {
  await fs.mkdir(require('node:path').dirname(outputPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, timestampSec)),
    '-i', videoPath, '-frames:v', '1', '-q:v', '3', outputPath,
  ]);
  return outputPath;
}

module.exports = { probeDuration: probeDurationSafe, compressVideo, extractAudio, extractFrame, ffmpegPath, ffprobePath };
