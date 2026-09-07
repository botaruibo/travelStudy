const fs = require('node:fs/promises');
const { compressVideo, extractAudio, extractAudioSegment, extractFrame, probeDuration } = require('./media.cjs');
const { transcribeAudio, segmentVttScenes, splitTranscriptByScenes, analyzeVideoWithVision } = require('./model-providers.cjs');
const { nowInChina } = require('./time.cjs');
const { toWebVtt } = require('./subtitle-normalize.cjs');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
}

function fallbackScenes(duration, transcript) {
  const safeDuration = Math.max(1, Number(duration) || 1);
  const count = Math.min(6, Math.max(3, Math.ceil(safeDuration / 240)));
  const chunk = safeDuration / count;
  return Array.from({ length: count }, (_, index) => {
    const start = index * chunk;
    const end = index === count - 1 ? safeDuration : (index + 1) * chunk;
    const excerpt = String(transcript || '').slice(index * 90, index * 90 + 160);
    return {
      title: `游学场景 ${String(index + 1).padStart(2, '0')}`,
      start_sec: start,
      end_sec: end,
      summary: excerpt || '根据视频时间段生成的待整理场景。',
      transcript: excerpt || '该场景暂未识别到语音文字，可在桌面端补充。'
    };
  });
}

function normalizeScenes(rawScenes, duration, transcript) {
  const safeDuration = Math.max(1, Number(duration) || 1);
  const items = Array.isArray(rawScenes) ? rawScenes : [];
  const normalized = items
    .map((scene, index) => {
      const start = clamp(scene.start_sec ?? scene.start ?? 0, 0, safeDuration);
      const end = clamp(scene.end_sec ?? scene.end ?? start + 1, start + 0.5, safeDuration);
      return {
        title: String(scene.title || `游学场景 ${String(index + 1).padStart(2, '0')}`),
        start_sec: start,
        end_sec: end,
        summary: String(scene.summary || scene.description || '待整理场景'),
        transcript: String(scene.transcript || scene.text || ''),
        study_advice: String(scene.study_advice || scene.studyAdvice || ''),
        keyframes: Array.isArray(scene.keyframes) ? scene.keyframes : [],
      };
    })
    .filter((scene) => scene.end_sec > scene.start_sec)
    .sort((a, b) => a.start_sec - b.start_sec);
  return normalized.length ? normalized : fallbackScenes(safeDuration, transcript);
}

async function writeTranscript(storage, videoId, text) {
  const transcriptPath = storage.transcriptPath(videoId);
  await fs.writeFile(transcriptPath, text || '', 'utf8');
  return transcriptPath;
}

async function writeSubtitle(storage, videoId, utterances) {
  const subtitlePath = storage.subtitlePath(videoId);
  await fs.writeFile(subtitlePath, toWebVtt(utterances), 'utf8');
  return subtitlePath;
}

function transcriptForScene(utterances, scene) {
  const start = Number(scene.start_sec) * 1000;
  const end = Number(scene.end_sec) * 1000;
  return utterances
    .filter((item) => Number(item.end_time) > start && Number(item.start_time) < end)
    .map((item) => item.text)
    .join('')
    .trim();
}

const ASR_SEGMENT_SECONDS = 300;

function mergeUtterances(utterances) {
  const unique = new Map();
  for (const item of Array.isArray(utterances) ? utterances : []) {
    const start = Number(item?.start_time);
    const end = Number(item?.end_time);
    const text = String(item?.text || '').trim();
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    unique.set(`${start}:${end}`, { start_time: start, end_time: end, text });
  }
  return [...unique.values()].sort((left, right) => left.start_time - right.start_time || left.end_time - right.end_time);
}

function vttTimeToMs(value) {
  const parts = String(value || '').trim().replace(',', '.').split(':').map(Number);
  if (parts.some((item) => !Number.isFinite(item))) return 0;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

function utterancesFromVtt(vtt) {
  const blocks = String(vtt || '').trim().split(/\r?\n\r?\n/);
  return mergeUtterances(blocks.map((block) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timeLine = lines.find((line) => line.includes('-->'));
    if (!timeLine) return null;
    const [start, end] = timeLine.split('-->').map((value) => value.trim().split(/\s+/)[0]);
    return {
      start_time: vttTimeToMs(start),
      end_time: vttTimeToMs(end),
      text: lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim(),
    };
  }));
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return fallback; }
}

async function persistTranscriptionCheckpoint({ db, storage, videoId, utterances, completedSegments, segmentCount, duration, asr = {} }) {
  const merged = mergeUtterances(utterances);
  const transcript = merged.map((item) => item.text).join('');
  const transcriptPath = await writeTranscript(storage, videoId, transcript);
  const subtitlePath = await writeSubtitle(storage, videoId, merged);
  const checkpointPath = storage.transcriptionCheckpointPath(videoId);
  await fs.writeFile(checkpointPath, JSON.stringify({
    version: 1,
    duration,
    segmentSeconds: ASR_SEGMENT_SECONDS,
    segmentCount,
    completedSegments,
    utterances: merged,
    asr,
  }), 'utf8');
  db.run(
    'UPDATE videos SET transcript_path = ?, subtitle_path = ?, analysis_metadata_json = ?, error = ?, updated_at = ? WHERE id = ?',
    [transcriptPath, subtitlePath, JSON.stringify({ transcription: { status: completedSegments.length === segmentCount ? 'complete' : 'partial', completedSegments, segmentCount, checkpointPath, ...asr } }), null, nowInChina(), videoId]
  );
  return { transcript, transcriptPath, subtitlePath, utterances: merged, checkpointPath };
}

async function resumeTranscription({ db, storage, video, videoId, audioPath, duration, modelConfigs, update }) {
  const checkpointPath = storage.transcriptionCheckpointPath(videoId);
  const segmentCount = Math.max(1, Math.ceil(duration / ASR_SEGMENT_SECONDS));
  const checkpoint = await readJson(checkpointPath, {});
  let utterances = mergeUtterances(checkpoint.utterances);
  const completedSegments = new Set(
    Array.isArray(checkpoint.completedSegments) ? checkpoint.completedSegments.filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount) : []
  );

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    if (completedSegments.has(segmentIndex)) continue;
    const startSec = segmentIndex * ASR_SEGMENT_SECONDS;
    const segmentDuration = Math.min(ASR_SEGMENT_SECONDS, duration - startSec);
    const segmentPath = storage.transcriptionSegmentPath(videoId, segmentIndex);
    update('transcribe', 0.34 + (segmentIndex / segmentCount) * 0.14, {
      label: `正在识别语音 ${segmentIndex + 1}/${segmentCount}`,
      audioProgress: Math.round((segmentIndex / segmentCount) * 100),
      completedSegments: [...completedSegments],
      segmentCount,
    });
    await extractAudioSegment(audioPath, segmentPath, startSec, segmentDuration);
    const segmentResult = await transcribeAudio(
      segmentPath,
      modelConfigs,
      (progress) => update('transcribe', 0.34 + ((segmentIndex + Math.min(1, progress)) / segmentCount) * 0.14, {
        label: `正在识别语音 ${segmentIndex + 1}/${segmentCount}`,
        audioProgress: Math.round(((segmentIndex + Math.min(1, progress)) / segmentCount) * 100),
        completedSegments: [...completedSegments],
        segmentCount,
      }),
      { timeOffsetMs: Math.round(startSec * 1000) }
    );
    utterances = mergeUtterances([...utterances, ...(segmentResult.utterances || [])]);
    completedSegments.add(segmentIndex);
    await persistTranscriptionCheckpoint({
      db, storage, videoId, utterances, completedSegments: [...completedSegments], segmentCount, duration,
      asr: { provider: segmentResult.provider, model: segmentResult.model, resourceId: segmentResult.resourceId, logId: segmentResult.logId },
    });
    await fs.rm(segmentPath, { force: true });
  }

  const result = await persistTranscriptionCheckpoint({
    db, storage, videoId, utterances, completedSegments: [...completedSegments], segmentCount, duration,
    asr: checkpoint.asr || { provider: 'volcengine', model: 'doubao-seed-asr-2.0' },
  });
  if (!result.utterances.length) throw new Error('火山 ASR 未返回带时间戳的最终分句');
  return { ...result, provider: checkpoint.asr?.provider || 'volcengine', model: checkpoint.asr?.model || 'doubao-seed-asr-2.0', resourceId: checkpoint.asr?.resourceId, logId: checkpoint.asr?.logId };
}

async function writePlaceholderFrame(filePath) {
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AYf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AYf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64');
  await fs.writeFile(filePath, jpeg);
}

async function runCompressionPipeline({ db, storage, videoId, onProgress }) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) throw new Error(`视频不存在：${videoId}`);
  const update = (stage, progress, extra = {}) => onProgress?.({ stage, progress, metadata: extra });
  const duration = await probeDuration(video.source_path);
  const proxyPath = storage.proxyPath(video.name, videoId);
  // #region debug-point A:compression-pipeline-start
  (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'A',location:'pipeline.cjs:runCompressionPipeline',msg:'[DEBUG] Compression pipeline entered',data:{videoId,sourcePath:video.source_path,proxyPath,duration},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  update('compress', 0.05, { label: '正在压缩视频' });
  let lastProgress = 0.05;
  await compressVideo(video.source_path, proxyPath, {
    onProgress: (encodedSeconds) => {
      if (!duration) return;
      const progress = Math.min(0.94, Math.max(0.05, 0.05 + (encodedSeconds / duration) * 0.9));
      if (progress - lastProgress < 0.005) return;
      lastProgress = progress;
      update('compress', progress, { label: '正在压缩视频' });
    },
  });
  // #region debug-point A:compression-pipeline-finished
  (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'A',location:'pipeline.cjs:runCompressionPipeline',msg:'[DEBUG] Compression pipeline returned from FFmpeg',data:{videoId,proxyPath},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  update('compress', 0.95, { label: '正在保存压缩视频' });
  const audioPath = storage.audioPath(videoId);
  try {
    await extractAudio(proxyPath, audioPath);
  } catch (error) {
    throw new Error(`压缩音频生成失败：${error.message}`);
  }
  db.run('UPDATE videos SET duration = ?, status = ?, proxy_path = ?, audio_path = ?, error = ?, updated_at = ? WHERE id = ?', [duration, 'compressed', proxyPath, audioPath, null, nowInChina(), videoId]);
  update('complete', 1, { label: '视频压缩完成', duration, proxyPath });
  return { videoId, duration, proxyPath };
}

async function runVideoPipeline({ db, storage, videoId, taskId, onProgress, modelConfigs }) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) throw new Error(`视频不存在：${videoId}`);
  const update = (stage, progress, extra = {}) => onProgress?.({ stage, progress, metadata: extra });
  const duration = Number(video.duration) || await probeDuration(video.source_path);
  const proxyPath = video.proxy_path;
  if (!proxyPath || !(await storage.fileExists(proxyPath))) throw new Error('请先完成视频压缩');
  const audioPath = storage.audioPath(videoId);
  const persistedTranscriptPath = storage.transcriptPath(videoId);
  const persistedSubtitlePath = storage.subtitlePath(videoId);
  const transcriptionCheckpoint = await readJson(storage.transcriptionCheckpointPath(videoId), {});
  const checkpointComplete = Array.isArray(transcriptionCheckpoint.completedSegments)
    && transcriptionCheckpoint.completedSegments.length >= Math.max(1, Math.ceil(duration / ASR_SEGMENT_SECONDS));
  // #region debug-point C:resume-artifact-state
  (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='volcengine-asr-resume';try{const e=fs.readFileSync('.dbg/volcengine-asr-resume.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'pipeline.cjs:runVideoPipeline',msg:'[DEBUG] Video analysis artifact state',data:{taskId,videoId,duration,audioExists:fs.existsSync(audioPath),transcriptExists:fs.existsSync(persistedTranscriptPath),subtitleExists:fs.existsSync(persistedSubtitlePath)},ts:Date.now()})}).catch(()=>{})})();
  // #endregion

  let mediaWarning = '';
  let transcriptResult;
  if (await storage.fileExists(persistedSubtitlePath) && (!transcriptionCheckpoint.version || checkpointComplete)) {
    const utterances = utterancesFromVtt(await fs.readFile(persistedSubtitlePath, 'utf8'));
    if (utterances.length) {
      transcriptResult = {
        text: await fs.readFile(persistedTranscriptPath, 'utf8').catch(() => utterances.map((item) => item.text).join('')),
        utterances,
        provider: 'volcengine',
        model: 'doubao-seed-asr-2.0',
        resumedFromSubtitle: true,
      };
      update('segment', 0.52, { label: '已复用已完成转录，正在分析关键场景' });
    }
  }
  if (!transcriptResult) {
    update('transcribe', 0.08, { label: '正在提取场景语音' });
    try { await extractAudio(proxyPath, audioPath); } catch (error) { mediaWarning = `音频提取降级：${error.message}`; }
    update('transcribe', 0.34, { label: '正在识别语音' });
    // #region debug-point A:asr-start
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='volcengine-asr-resume';try{const e=fs.readFileSync('.dbg/volcengine-asr-resume.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'pipeline.cjs:runVideoPipeline',msg:'[DEBUG] Starting resumable Volcengine ASR',data:{taskId,videoId,audioBytes:fs.existsSync(audioPath)?fs.statSync(audioPath).size:0},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    transcriptResult = await resumeTranscription({ db, storage, video, videoId, audioPath, duration, modelConfigs, update });
    // #region debug-point B:asr-complete
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='volcengine-asr-resume';try{const e=fs.readFileSync('.dbg/volcengine-asr-resume.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'B',location:'pipeline.cjs:runVideoPipeline',msg:'[DEBUG] Resumable Volcengine ASR completed',data:{taskId,videoId,utteranceCount:Array.isArray(transcriptResult?.utterances)?transcriptResult.utterances.length:0,textLength:String(transcriptResult?.text||'').length,requestId:transcriptResult?.requestId,logId:transcriptResult?.logId},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
  }
  const transcript = transcriptResult?.text || '';
  const transcriptPath = transcriptResult?.transcriptPath || await writeTranscript(storage, videoId, transcript);
  const utterances = Array.isArray(transcriptResult?.utterances) ? transcriptResult.utterances : [];
  if (!utterances.length) throw new Error('火山 ASR 未返回带时间戳的最终分句');
  const subtitlePath = transcriptResult?.subtitlePath || persistedSubtitlePath;
  if (!(await storage.fileExists(subtitlePath))) await writeSubtitle(storage, videoId, utterances);
  db.run(
    'UPDATE videos SET audio_path = ?, transcript_path = ?, subtitle_path = ?, error = ?, updated_at = ? WHERE id = ?',
    [audioPath, transcriptPath, subtitlePath, null, nowInChina(), videoId]
  );
  update('transcribe', 0.48, { label: '语音识别完成，正在保存字幕', warning: transcriptResult?.warning });

  let sceneResult;
  update('segment', 0.52, { label: '正在分析关键场景' });
  try {
    sceneResult = await segmentVttScenes({
      vtt: await fs.readFile(subtitlePath, 'utf8'),
      duration,
      modelConfigs,
      onProgress: ({ completed, total, window }) => update('segment', 0.52 + (Math.min(completed, total) / total) * 0.1, {
        label: completed >= total
          ? '场景分析完成，正在整理结果'
          : `正在分析场景字幕 ${completed + 1}/${total}`,
        sceneWindow: {
          completed,
          total,
          startSec: window?.startSec,
          endSec: window?.endSec,
        },
      }),
    });
  } catch (error) {
    throw new Error(`基于字幕的场景分析失败：${error.message}`);
  }
  const scenes = normalizeScenes(sceneResult?.scenes, duration, transcript);
  const keyedScenes = scenes.map((scene) => ({
    ...scene,
    transcript: transcriptForScene(utterances, scene),
    keyframes: scene.keyframes,
  }));
  update('segment', 0.62, { label: '场景分析完成', warning: sceneResult?.warning });

  db.run('DELETE FROM keyframes WHERE scene_id IN (SELECT id FROM scenes WHERE video_id = ?)', [videoId]);
  db.run('DELETE FROM scenes WHERE video_id = ?', [videoId]);
  const frameRowsByScene = {};
  for (let sceneIndex = 0; sceneIndex < keyedScenes.length; sceneIndex += 1) {
    const scene = keyedScenes[sceneIndex];
    const sceneId = `${videoId}-scene-${sceneIndex + 1}`;
    db.run(
      'INSERT INTO scenes (id, video_id, scene_index, title, start_sec, end_sec, summary, transcript, study_advice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sceneId, videoId, sceneIndex, scene.title, scene.start_sec, scene.end_sec, scene.summary, scene.transcript, scene.study_advice, nowInChina()]
    );
    const frameCandidates = scene.keyframes.length
      ? scene.keyframes.slice(0, 5)
      : [0.2, 0.5, 0.8].map((ratio) => ({ time: scene.start_sec + (scene.end_sec - scene.start_sec) * ratio, keyword: '' }));
    frameRowsByScene[sceneId] = [];
    for (let frameIndex = 0; frameIndex < frameCandidates.length; frameIndex += 1) {
      const frame = frameCandidates[frameIndex];
      const timestamp = clamp(frame.time, scene.start_sec, Math.min(scene.end_sec, Math.max(0, duration - 0.2)));
      const frameLocation = storage.framePath(videoId, sceneIndex, frameIndex);
      await storage.ensureParent(frameLocation.file);
      if (mediaWarning) await writePlaceholderFrame(frameLocation.file); else {
        try { await extractFrame(proxyPath, timestamp, frameLocation.file); }
        catch (error) { mediaWarning = `关键帧提取降级：${error.message}`; await writePlaceholderFrame(frameLocation.file); }
      }
      const frameId = `${sceneId}-frame-${frameIndex + 1}`;
      db.run(
        'INSERT INTO keyframes (id, scene_id, frame_index, timestamp_sec, keyword, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [frameId, sceneId, frameIndex, timestamp, String(frame.keyword || ''), frameLocation.file, nowInChina()]
      );
      frameRowsByScene[sceneId].push({ id: frameId, scene_id: sceneId, frame_index: frameIndex, timestamp_sec: timestamp, keyword: String(frame.keyword || ''), path: frameLocation.file });
    }
    update('frames', 0.64 + ((sceneIndex + 1) / keyedScenes.length) * 0.31, { label: `正在提取关键帧 ${sceneIndex + 1}/${keyedScenes.length}` });
  }

  db.run(
    'UPDATE videos SET duration = ?, status = ?, proxy_path = ?, audio_path = ?, transcript_path = ?, subtitle_path = ?, analysis_status = ?, analysis_metadata_json = ?, error = ?, updated_at = ? WHERE id = ?',
    [duration, 'ready', proxyPath, audioPath, transcriptPath, subtitlePath, 'draft', JSON.stringify({ method: 'audio', keywords: sceneResult?.keywords || [], asr: { provider: transcriptResult?.provider, model: transcriptResult?.model, resource_id: transcriptResult?.resourceId, log_id: transcriptResult?.logId }, segment: { provider: sceneResult?.provider, model: sceneResult?.model } }), null, nowInChina(), videoId]
  );
  update('complete', 1, { label: '视频分析完成，已保存为草稿', sceneCount: keyedScenes.length, duration, frameRowsByScene, warning: mediaWarning });
  return { videoId, duration, scenes: keyedScenes, sceneCount: keyedScenes.length, transcript, proxyPath: mediaWarning ? null : proxyPath, audioPath, transcriptPath, subtitlePath, warning: mediaWarning };
}

function normalizeVisionScenes(rawScenes, duration) {
  const scenes = normalizeScenes(rawScenes, duration, '');
  return scenes.map((scene, index) => {
    const raw = rawScenes[index] || {};
    const keyframeTimes = Array.isArray(raw.keyframe_times) ? raw.keyframe_times : [];
    return {
      ...scene,
      keyframe_times: [...new Set(keyframeTimes.map((time) => clamp(time, scene.start_sec, scene.end_sec)).filter(Number.isFinite))].slice(0, 6),
    };
  });
}

async function runVisionVideoPipeline({ db, storage, videoId, onProgress, modelConfigs }) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) throw new Error(`视频不存在：${videoId}`);
  const proxyPath = video.proxy_path;
  if (!proxyPath || !(await storage.fileExists(proxyPath))) throw new Error('请先完成视频压缩');
  const duration = Number(video.duration) || await probeDuration(proxyPath);
  const update = (stage, progress, extra = {}) => onProgress?.({ stage, progress, ...extra });
  update('vision-analyze', 0.08, { label: '正在上传压缩视频并分析画面' });
  const analysis = await analyzeVideoWithVision({ videoPath: proxyPath, duration, modelConfigs });
  const scenes = normalizeVisionScenes(analysis.scenes, duration);
  if (!scenes.length) throw new Error('视频模型未返回可用场景');
  update('vision-analyze', 0.55, { label: '视频模型分析完成，正在生成关键帧' });
  db.run('DELETE FROM keyframes WHERE scene_id IN (SELECT id FROM scenes WHERE video_id = ?)', [videoId]);
  db.run('DELETE FROM scenes WHERE video_id = ?', [videoId]);
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex];
    const sceneId = `${videoId}-scene-${sceneIndex + 1}`;
    db.run(
      'INSERT INTO scenes (id, video_id, scene_index, title, start_sec, end_sec, summary, transcript, study_advice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sceneId, videoId, sceneIndex, scene.title, scene.start_sec, scene.end_sec, scene.summary, scene.transcript, scene.study_advice, nowInChina()]
    );
    const frameTimes = scene.keyframe_times.length
      ? scene.keyframe_times
      : [scene.start_sec + (scene.end_sec - scene.start_sec) * 0.33, scene.start_sec + (scene.end_sec - scene.start_sec) * 0.67];
    for (let frameIndex = 0; frameIndex < frameTimes.length; frameIndex += 1) {
      const timestamp = clamp(frameTimes[frameIndex], 0, Math.max(0, duration - 0.2));
      const frameLocation = storage.framePath(videoId, sceneIndex, frameIndex);
      await storage.ensureParent(frameLocation.file);
      await extractFrame(proxyPath, timestamp, frameLocation.file);
      db.run(
        'INSERT INTO keyframes (id, scene_id, frame_index, timestamp_sec, path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`${sceneId}-frame-${frameIndex + 1}`, sceneId, frameIndex, timestamp, frameLocation.file, nowInChina()]
      );
    }
    update('frames', 0.58 + ((sceneIndex + 1) / scenes.length) * 0.38, { label: `正在提取关键帧 ${sceneIndex + 1}/${scenes.length}` });
  }
  db.run(
    'UPDATE videos SET duration = ?, status = ?, proxy_path = ?, analysis_status = ?, analysis_metadata_json = ?, error = ?, updated_at = ? WHERE id = ?',
    [duration, 'ready', proxyPath, 'draft', JSON.stringify({ method: 'vision', keywords: analysis.keywords, provider: analysis.provider, model: analysis.model }), null, nowInChina(), videoId]
  );
  update('complete', 1, { label: '视频分析完成，已保存为草稿', sceneCount: scenes.length });
  return { videoId, duration, sceneCount: scenes.length, keywords: analysis.keywords, provider: analysis.provider, model: analysis.model, analysisStatus: 'draft' };
}

async function runTranscriptPipeline({ db, storage, videoId, onProgress, modelConfigs }) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) throw new Error(`视频不存在：${videoId}`);
  const sourcePath = video.proxy_path && await storage.fileExists(video.proxy_path) ? video.proxy_path : video.source_path;
  if (!sourcePath || !(await storage.fileExists(sourcePath))) throw new Error('找不到可用于提取音频的视频文件');
  const update = (stage, progress, extra = {}) => onProgress?.({ stage, progress, ...extra });
  const audioPath = storage.audioPath(videoId);
  update('extract-audio', 0.08, { label: '正在重新提取 MP3 音频' });
  await extractAudio(sourcePath, audioPath);
  update('transcribe', 0.34, { label: '正在调用语音识别模型' });
  const asr = await transcribeAudio(audioPath, modelConfigs);
  if (!asr.text) throw new Error(asr.warning || '语音识别未返回文字，请检查语音识别模型与密钥');
  const transcriptPath = await writeTranscript(storage, videoId, asr.text);
  const subtitlePath = await writeSubtitle(storage, videoId, asr.utterances || []);
  const scenes = db.all('SELECT id, title, start_sec, end_sec FROM scenes WHERE video_id = ? ORDER BY scene_index', [videoId]);
  if (!scenes.length) throw new Error('该视频没有可分配文字的场景');
  update('split-transcript', 0.62, { label: '正在将转写分配到场景' });
  const split = await splitTranscriptByScenes({ transcript: asr.text, scenes, modelConfigs });
  for (const scene of scenes) db.run('UPDATE scenes SET transcript = ? WHERE id = ?', [split.transcripts[scene.id] || '', scene.id]);
  db.run('UPDATE videos SET audio_path = ?, transcript_path = ?, subtitle_path = ?, error = ?, updated_at = ? WHERE id = ?', [audioPath, transcriptPath, subtitlePath, null, nowInChina(), videoId]);
  update('complete', 1, { label: '场景文字生成完成', warning: split.warning });
  return { videoId, audioPath, transcriptPath, subtitlePath, transcriptLength: asr.text.length, asr: { provider: asr.provider, model: asr.model, warning: asr.warning }, split: { provider: split.provider, model: split.model, warning: split.warning } };
}

module.exports = { runCompressionPipeline, runVideoPipeline, runTranscriptPipeline, runVisionVideoPipeline, normalizeScenes, fallbackScenes };
