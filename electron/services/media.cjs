const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const ffmpegStaticPath = require('ffmpeg-static');
let installerPath = null;
try { installerPath = require('@ffmpeg-installer/ffmpeg').path; } catch { /* optional fallback */ }
const ffmpegPath = process.env.FFMPEG_BIN || installerPath || ffmpegStaticPath;
const ffprobePath = require('ffprobe-static').path;

function run(binary, args, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';
    let stderrReported = false;
    let progressBuffer = '';
    const startedAt = Date.now();
    // #region debug-point B:ffmpeg-spawned
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'B',location:'media.cjs:run',msg:'[DEBUG] FFmpeg process spawned',data:{binary,args:args.slice(0,12),pid:child.pid},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    child.stderr.on('data', (chunk) => {
      const value = chunk.toString();
      stderr += value;
      progressBuffer += value;
      let newline = progressBuffer.indexOf('\n');
      while (newline >= 0) {
        const line = progressBuffer.slice(0, newline).trim();
        progressBuffer = progressBuffer.slice(newline + 1);
        const [key, rawValue] = line.split('=', 2);
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const microseconds = Number(rawValue);
          if (Number.isFinite(microseconds) && microseconds >= 0) onProgress?.(microseconds / 1000000);
        }
        newline = progressBuffer.indexOf('\n');
      }
      if (!stderrReported) { stderrReported = true; // #region debug-point C:ffmpeg-first-stderr
      (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'C',location:'media.cjs:stderr',msg:'[DEBUG] FFmpeg emitted stderr',data:{pid:child.pid,stderr:String(chunk).slice(0,500)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      }
    });
    child.on('error', (error) => { // #region debug-point B:ffmpeg-error
      (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'B',location:'media.cjs:error',msg:'[DEBUG] FFmpeg process error',data:{pid:child.pid,error:String(error?.message||error)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      reject(error);
    });
    child.on('close', (code) => {
      // #region debug-point A:ffmpeg-closed
      (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'A',location:'media.cjs:close',msg:'[DEBUG] FFmpeg process closed',data:{pid:child.pid,code,durationMs:Date.now()-startedAt,stderrTail:stderr.slice(-500)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
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

async function compressVideo(inputPath, outputPath, { onProgress } = {}) {
  await fs.mkdir(require('node:path').dirname(outputPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:2', '-nostats', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=w=min\\(1280\\,iw\\):h=-2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outputPath,
  ], { onProgress });
  return outputPath;
}

async function extractAudio(videoPath, audioPath) {
  await fs.mkdir(path.dirname(audioPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', audioPath,
  ]);
  return audioPath;
}

async function extractAudioSegment(audioPath, outputPath, startSec, durationSec) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(Math.max(0, startSec)), '-t', String(Math.max(0.1, durationSec)),
    '-i', audioPath, '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', outputPath,
  ]);
  return outputPath;
}

async function extractFrame(videoPath, timestampSec, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, timestampSec)),
    '-i', videoPath, '-frames:v', '1', '-q:v', '3', outputPath,
  ]);
  return outputPath;
}

module.exports = { probeDuration: probeDurationSafe, compressVideo, extractAudio, extractAudioSegment, extractFrame, ffmpegPath, ffprobePath };
