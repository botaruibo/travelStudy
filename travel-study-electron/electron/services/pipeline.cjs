const fs = require('node:fs/promises');
const path = require('node:path');
const { compressVideo, extractAudio, extractFrame, probeDuration } = require('./media.cjs');
const { transcribeAudio, segmentScenes } = require('./siliconflow.cjs');

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
      title: `研学场景 ${String(index + 1).padStart(2, '0')}`,
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
        title: String(scene.title || `研学场景 ${String(index + 1).padStart(2, '0')}`),
        start_sec: start,
        end_sec: end,
        summary: String(scene.summary || scene.description || '待整理场景'),
        transcript: String(scene.transcript || scene.text || '')
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

async function writePlaceholderFrame(filePath) {
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AYf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AYf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64');
  await fs.writeFile(filePath, jpeg);
}

async function runVideoPipeline({ db, storage, videoId, taskId, onProgress }) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) throw new Error(`视频不存在：${videoId}`);
  const update = (stage, progress, extra = {}) => onProgress?.({ stage, progress, ...extra });
  const duration = await probeDuration(video.source_path);
  const proxyPath = storage.proxyPath(videoId);
  const audioPath = storage.audioPath(videoId);

  update('compress', 0.05, { label: '正在压缩视频' });
  let mediaWarning = '';
  try { await compressVideo(video.source_path, proxyPath); } catch (error) { mediaWarning = `FFmpeg 压缩不可用，已进入演示降级：${error.message}`; }
  update('compress', 0.28, { label: '视频压缩完成' });
  try { await extractAudio(mediaWarning ? video.source_path : proxyPath, audioPath); } catch (error) { mediaWarning = mediaWarning || `音频提取降级：${error.message}`; }

  let transcriptResult;
  update('transcribe', 0.34, { label: '正在识别语音' });
  try {
    transcriptResult = await transcribeAudio(audioPath);
  } catch (error) {
    transcriptResult = { text: '', provider: 'fallback', warning: `语音识别失败：${error.message}` };
  }
  const transcript = transcriptResult?.text || '';
  const transcriptPath = await writeTranscript(storage, videoId, transcript);
  update('transcribe', 0.48, { label: '语音识别完成', warning: transcriptResult?.warning });

  let sceneResult;
  update('segment', 0.52, { label: '正在分析关键场景' });
  try {
    sceneResult = await segmentScenes({ transcript, duration });
  } catch (error) {
    sceneResult = { scenes: [], provider: 'fallback', warning: `场景分析失败：${error.message}` };
  }
  const scenes = normalizeScenes(sceneResult?.scenes, duration, transcript);
  update('segment', 0.62, { label: '场景分析完成', warning: sceneResult?.warning });

  db.run('DELETE FROM keyframes WHERE scene_id IN (SELECT id FROM scenes WHERE video_id = ?)', [videoId]);
  db.run('DELETE FROM scenes WHERE video_id = ?', [videoId]);
  const frameRowsByScene = {};
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex];
    const sceneId = `${videoId}-scene-${sceneIndex + 1}`;
    db.run(
      'INSERT INTO scenes (id, video_id, scene_index, title, start_sec, end_sec, summary, transcript, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sceneId, videoId, sceneIndex, scene.title, scene.start_sec, scene.end_sec, scene.summary, scene.transcript, new Date().toISOString()]
    );
    const frameTimes = [
      scene.start_sec + (scene.end_sec - scene.start_sec) * 0.2,
      scene.start_sec + (scene.end_sec - scene.start_sec) * 0.5,
      scene.start_sec + (scene.end_sec - scene.start_sec) * 0.8
    ];
    frameRowsByScene[sceneId] = [];
    for (let frameIndex = 0; frameIndex < frameTimes.length; frameIndex += 1) {
      const timestamp = clamp(frameTimes[frameIndex], 0, Math.max(0, duration - 0.2));
      const frameLocation = storage.framePath(videoId, sceneIndex, frameIndex);
      await storage.ensureParent(frameLocation.file);
      if (mediaWarning) await writePlaceholderFrame(frameLocation.file); else {
        try { await extractFrame(proxyPath, timestamp, frameLocation.file); }
        catch (error) { mediaWarning = `关键帧提取降级：${error.message}`; await writePlaceholderFrame(frameLocation.file); }
      }
      const frameId = `${sceneId}-frame-${frameIndex + 1}`;
      db.run(
        'INSERT INTO keyframes (id, scene_id, frame_index, timestamp_sec, path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [frameId, sceneId, frameIndex, timestamp, frameLocation.file, new Date().toISOString()]
      );
      frameRowsByScene[sceneId].push({ id: frameId, scene_id: sceneId, frame_index: frameIndex, timestamp_sec: timestamp, path: frameLocation.file });
    }
    update('frames', 0.64 + ((sceneIndex + 1) / scenes.length) * 0.31, { label: `正在提取关键帧 ${sceneIndex + 1}/${scenes.length}` });
  }

  db.run(
    'UPDATE videos SET duration = ?, status = ?, proxy_path = ?, audio_path = ?, transcript_path = ?, error = ?, updated_at = ? WHERE id = ?',
    [duration, 'ready', proxyPath, audioPath, transcriptPath, null, new Date().toISOString(), videoId]
  );
  update('complete', 1, { label: '视频分析完成', sceneCount: scenes.length, duration, frameRowsByScene, warning: mediaWarning });
  return { videoId, duration, scenes, sceneCount: scenes.length, transcript, proxyPath: mediaWarning ? null : proxyPath, audioPath, transcriptPath, warning: mediaWarning };
}

module.exports = { runVideoPipeline, normalizeScenes, fallbackScenes };
