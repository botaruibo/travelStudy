const fs = require('node:fs');
const path = require('node:path');
const { createClipPdf, mergeClipPdfs } = require('./pdf.cjs');
const { DEFAULT_NOTEBOOK_ID } = require('./database.cjs');
const { extractFrame, probeDuration } = require('./media.cjs');
const { nowInChina, toChinaTimeString } = require('./time.cjs');

const SAMPLE_VIDEO_ID = 'sample-study-video';
const SAMPLE_NOTE_ID = 'sample-study-note';
const SAMPLE_VIDEO_NAME = '植物园游学_上午.mp4';
const SAMPLE_NOTE_NAME = '植物园游学_上午 · 研学笔记';
const SAMPLE_DURATION = 1296;
const SAMPLE_SCENES = [
  { id: 'sample-scene-1', clientId: 'scene-1', scene_index: 1, title: '入园与集合', start_sec: 0, end_sec: 155, frame_count: 4, summary: '老师说明今日观察任务，学生在温室入口完成分组并领取观察记录卡。' },
  { id: 'sample-scene-2', clientId: 'scene-2', scene_index: 2, title: '导游介绍植物 A', start_sec: 155, end_sec: 468, frame_count: 6, summary: '导游带领同学们认识植物 A，介绍其形态特征、名称来源、生活习性及在园区中的分布情况。' },
  { id: 'sample-scene-3', clientId: 'scene-3', scene_index: 3, title: '温室自由观察', start_sec: 468, end_sec: 804, frame_count: 6, summary: '学生分组观察叶片与叶脉，用相机记录形态差异，并在记录卡上完成初步描述。' },
  { id: 'sample-scene-4', clientId: 'scene-4', scene_index: 4, title: '多肉植物区讲解', start_sec: 804, end_sec: 1025, frame_count: 5, summary: '导游介绍多肉植物储水结构与干旱环境适应方式。' },
  { id: 'sample-scene-5', clientId: 'scene-5', scene_index: 5, title: '水生植物区观察', start_sec: 1025, end_sec: 1296, frame_count: 5, summary: '学生观察水生植物叶片浮水与挺水的差异。' },
];
const SAMPLE_CLIPS = [
  { id: 'clip-1', name: '植物园上午场.pdf', source: '植物园游学_上午.mp4', location: '上海植物园', page_count: 8 },
  { id: 'clip-2', name: '昆虫观察.pdf', source: '植物园游学_下午.mp4', location: '上海植物园', page_count: 6 },
  { id: 'clip-3', name: '动物保护教育.pdf', source: '动物园导览.mp4', location: '上海动物园', page_count: 10 },
  { id: 'clip-4', name: '城市博物馆.pdf', source: '博物馆讲解.mov', location: '上海博物馆', page_count: 7 },
];

function now() {
  return nowInChina();
}

function sampleSelections() {
  return Object.fromEntries(SAMPLE_SCENES.map((scene) => [scene.id, Array.from({ length: scene.frame_count }, (_, index) => index)]));
}

function sampleTranscripts() {
  return Object.fromEntries(SAMPLE_SCENES.map((scene) => [scene.id, scene.summary]));
}

function existingFile(...candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function frameTimestamp(scene, frameIndex) {
  return scene.start_sec + ((scene.end_sec - scene.start_sec) * (frameIndex + 1)) / (scene.frame_count + 1);
}

async function seedSampleKeyframes({ db, storage, samplePath, mediaDuration, stamp }) {
  for (const scene of SAMPLE_SCENES) {
    const existing = db.all('SELECT id, frame_index, path FROM keyframes WHERE scene_id = ? ORDER BY frame_index', [scene.id]);
    const existingIndexes = new Set(existing.filter((frame) => fs.existsSync(frame.path)).map((frame) => frame.frame_index));
    for (let frameIndex = 0; frameIndex < scene.frame_count; frameIndex += 1) {
      if (existingIndexes.has(frameIndex)) continue;
      const timestampSec = frameTimestamp(scene, frameIndex);
      const mediaTimestamp = Math.min(Math.max(0.05, (timestampSec / SAMPLE_DURATION) * mediaDuration), Math.max(0.05, mediaDuration - 0.1));
      const frameLocation = storage.framePath(SAMPLE_VIDEO_ID, scene.scene_index, frameIndex);
      await storage.ensureParent(frameLocation.file);
      await extractFrame(samplePath, mediaTimestamp, frameLocation.file);
      const existingFrame = existing.find((frame) => frame.frame_index === frameIndex);
      if (existingFrame) {
        db.run('UPDATE keyframes SET timestamp_sec = ?, path = ? WHERE id = ?', [timestampSec, frameLocation.file, existingFrame.id]);
        continue;
      }
      db.run(
        'INSERT INTO keyframes (id, scene_id, frame_index, timestamp_sec, path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`${scene.id}-frame-${frameIndex + 1}`, scene.id, frameIndex, timestampSec, frameLocation.file, stamp]
      );
    }
  }
}

async function seedSampleClips({ db, storage, selections, transcripts, stamp }) {
  const frameRowsByScene = Object.fromEntries(SAMPLE_SCENES.map((scene) => [scene.id, db.all('SELECT id, scene_id, frame_index, timestamp_sec, path FROM keyframes WHERE scene_id = ? ORDER BY frame_index', [scene.id])]));
  for (const clip of SAMPLE_CLIPS) {
    const clipPath = storage.clipPath(clip.id);
    if (!(await storage.fileExists(clipPath))) {
      const pages = Array.from({ length: clip.page_count }, (_, index) => ({ ...SAMPLE_SCENES[index % SAMPLE_SCENES.length], transcript: SAMPLE_SCENES[index % SAMPLE_SCENES.length].summary }));
      await createClipPdf({ clipId: clip.id, video: { id: SAMPLE_VIDEO_ID, name: clip.source }, scenes: pages, frameRowsByScene, storage });
    }
    if (!db.get('SELECT id FROM clips WHERE id = ?', [clip.id])) {
      db.run(
        'INSERT INTO clips (id, video_id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [clip.id, SAMPLE_VIDEO_ID, clip.name, clipPath, clip.page_count, JSON.stringify({ selections, transcripts, source: clip.source, location: clip.location, sample: true }), stamp]
      );
    }
  }
}

async function ensureSampleData({ db, storage, sampleVideoPath }) {
  const stamp = now();
  const fallbackSamplePath = path.join(__dirname, '..', '..', 'example', 'sample-study.mp4');
  const existingVideo = db.get('SELECT id, source_path, proxy_path, source_size, source_mtime FROM videos WHERE id = ?', [SAMPLE_VIDEO_ID]);
  const samplePath = existingFile(sampleVideoPath, fallbackSamplePath, existingVideo?.proxy_path, existingVideo?.source_path);
  const stat = samplePath ? fs.statSync(samplePath) : null;
  if (!existingVideo) {
    db.run(
      'INSERT INTO videos (id, name, source_path, source_size, source_mtime, duration, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [SAMPLE_VIDEO_ID, SAMPLE_VIDEO_NAME, samplePath, stat?.size || 0, stat ? toChinaTimeString(stat.mtime) : stamp, SAMPLE_DURATION, 'ready', stamp, stamp]
    );
  } else if (samplePath) {
    db.run(
      'UPDATE videos SET source_path = ?, source_size = ?, source_mtime = ?, duration = ?, status = ?, updated_at = ? WHERE id = ?',
      [samplePath, stat?.size || 0, stat ? toChinaTimeString(stat.mtime) : stamp, SAMPLE_DURATION, 'ready', stamp, SAMPLE_VIDEO_ID]
    );
  } else {
    db.run(
      'UPDATE videos SET duration = ?, status = ?, updated_at = ? WHERE id = ?',
      [SAMPLE_DURATION, 'ready', stamp, SAMPLE_VIDEO_ID]
    );
  }
  for (const scene of SAMPLE_SCENES) {
    if (!db.get('SELECT id FROM scenes WHERE id = ?', [scene.id])) {
      db.run(
        'INSERT INTO scenes (id, video_id, scene_index, title, start_sec, end_sec, summary, transcript, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [scene.id, SAMPLE_VIDEO_ID, scene.scene_index, scene.title, scene.start_sec, scene.end_sec, scene.summary, scene.summary, stamp]
      );
    }
  }

  const notePath = storage.notePath(SAMPLE_NOTE_ID);
  const selections = sampleSelections();
  const transcripts = sampleTranscripts();
  const legacySampleClipId = 'sample-study-clip';
  if (db.get('SELECT id FROM clips WHERE id = ?', [legacySampleClipId])) db.run('DELETE FROM clips WHERE id = ?', [legacySampleClipId]);
  const mediaDuration = samplePath ? Math.max(0.2, await probeDuration(samplePath)) : SAMPLE_DURATION;
  if (samplePath) await seedSampleKeyframes({ db, storage, samplePath, mediaDuration, stamp });
  await seedSampleClips({ db, storage, selections, transcripts, stamp });
  const firstClipPath = storage.clipPath(SAMPLE_CLIPS[0].id);
  if (!(await storage.fileExists(notePath)) && (await storage.fileExists(firstClipPath))) {
    try {
      await mergeClipPdfs({ noteId: SAMPLE_NOTE_ID, clipPaths: [firstClipPath], storage });
    } catch {
      /* ignore */
    }
  }
  const noteMetadata = JSON.stringify({ clipIds: [SAMPLE_CLIPS[0].id], sample: true });
  if (!db.get('SELECT id FROM notes WHERE id = ?', [SAMPLE_NOTE_ID])) {
    db.run(
      'INSERT INTO notes (id, notebook_id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [SAMPLE_NOTE_ID, DEFAULT_NOTEBOOK_ID, SAMPLE_NOTE_NAME, notePath, SAMPLE_CLIPS[0].page_count, noteMetadata, stamp]
    );
  } else {
    db.run('UPDATE notes SET name = ?, path = ?, page_count = ?, metadata_json = ? WHERE id = ?', [SAMPLE_NOTE_NAME, notePath, SAMPLE_CLIPS[0].page_count, noteMetadata, SAMPLE_NOTE_ID]);
  }
}

module.exports = {
  SAMPLE_VIDEO_ID,
  SAMPLE_NOTE_ID,
  SAMPLE_VIDEO_NAME,
  SAMPLE_SCENES,
  SAMPLE_CLIPS,
  ensureSampleData,
};
