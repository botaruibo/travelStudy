const crypto = require('node:crypto');
const { runCompressionPipeline, runTranscriptPipeline, runVideoPipeline, runVisionVideoPipeline } = require('./pipeline.cjs');
const { createClipPdf, mergeClipPdfs } = require('./pdf.cjs');
const { readModelConfig } = require('./model-config.cjs');
const { DEFAULT_NOTEBOOK_ID } = require('./database.cjs');
const { SAMPLE_VIDEO_ID, SAMPLE_SCENES } = require('./sample-data.cjs');
const { nowInChina } = require('./time.cjs');

const now = () => nowInChina();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
class TaskManager {
  constructor({ db, storage, onUpdate }) {
    this.db = db;
    this.storage = storage;
    this.onUpdate = onUpdate;
    this.activeVideoTaskId = null;
    this.running = new Set();
  }

  init() {
    this.db.run("UPDATE tasks SET status = 'failed', error = '应用关闭，需要重试', updated_at = ? WHERE status = 'running'", [now()]);
    this.pump();
  }

  list() { return this.db.all('SELECT * FROM tasks ORDER BY created_at DESC'); }

  task(taskId) { return this.db.get('SELECT * FROM tasks WHERE id = ?', [taskId]); }

  emit(taskId) {
    const task = this.task(taskId);
    if (task) this.onUpdate?.({ ...task, metadata: task.metadata_json ? JSON.parse(task.metadata_json) : {} });
    return task;
  }

  createVideoTask(videoId) {
    const queued = this.db.get("SELECT id FROM tasks WHERE entity_id = ? AND kind = 'video-analysis' AND status IN ('queued', 'running')", [videoId]);
    if (queued) return this.task(queued.id);
    const taskId = id('task-video');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'video-analysis', videoId, 'queued', 'queued', 0, null, JSON.stringify({ retryMode: 'checkpoint' }), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createVisionVideoTask(videoId) {
    const queued = this.db.get("SELECT id FROM tasks WHERE entity_id = ? AND kind = 'video-vision-analysis' AND status IN ('queued', 'running')", [videoId]);
    if (queued) return this.task(queued.id);
    const taskId = id('task-video-vision');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'video-vision-analysis', videoId, 'queued', 'queued', 0, null, JSON.stringify({ method: 'vision' }), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createProtectedAnalysisTask({ taskId, requestId, videoId, method, metadata }) {
    const kind = method === 'vision' ? 'video-vision-analysis' : 'video-analysis';
    this.db.run(
      'INSERT INTO tasks (id, request_id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, requestId, kind, videoId, 'queued', 'queued', 0, null, JSON.stringify(metadata), now(), now()]
    );
    return this.task(taskId);
  }

  schedule() {
    this.pump();
  }

  createCompressionTask(videoId) {
    const video = this.db.get('SELECT id, status FROM videos WHERE id = ?', [videoId]);
    if (!video) throw new Error('视频不存在');
    if (video.status === 'compressed' || video.status === 'ready') throw new Error('该视频已经压缩完成');
    const queued = this.db.get("SELECT id FROM tasks WHERE entity_id = ? AND kind = 'video-compress' AND status IN ('queued', 'running')", [videoId]);
    if (queued) return this.task(queued.id);
    const taskId = id('task-compress');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'video-compress', videoId, 'queued', 'queued', 0, null, JSON.stringify({}), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createTranscriptTask(videoId) {
    const queued = this.db.get("SELECT id FROM tasks WHERE entity_id = ? AND kind = 'video-transcript' AND status IN ('queued', 'running')", [videoId]);
    if (queued) return this.task(queued.id);
    const taskId = id('task-transcript');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'video-transcript', videoId, 'queued', 'queued', 0, null, JSON.stringify({}), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createClipTask(videoId, selections, settings = {}, transcripts = {}) {
    const taskId = id('task-clip');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'clip-pdf', videoId, 'queued', 'queued', 0, null, JSON.stringify({ selections, settings, transcripts }), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createPreviewClipTask(selections, settings = {}, transcripts = {}) {
    const taskId = id('task-clip');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'clip-pdf', SAMPLE_VIDEO_ID, 'queued', 'queued', 0, null, JSON.stringify({ preview: true, selections, settings, transcripts }), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createNoteTask(clipIds, cover) {
    const taskId = id('task-note');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'note-merge', taskId, 'queued', 'queued', 0, null, JSON.stringify({ clipIds, cover }), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  update(taskId, patch) {
    const current = this.task(taskId);
    if (!current) return;
    let currentMetadata = {};
    try { currentMetadata = current.metadata_json ? JSON.parse(current.metadata_json) : {}; } catch { currentMetadata = {}; }
    const next = {
      ...current,
      ...patch,
      metadata_json: JSON.stringify({ ...currentMetadata, ...(patch.metadata || {}) }),
      updated_at: now(),
    };
    this.db.run(
      'UPDATE tasks SET status = ?, stage = ?, progress = ?, error = ?, metadata_json = ?, updated_at = ? WHERE id = ?',
      [next.status, next.stage, next.progress, next.error || null, typeof next.metadata_json === 'string' ? next.metadata_json : JSON.stringify(next.metadata || {}), next.updated_at, taskId]
    );
    this.emit(taskId);
  }

  async runVideo(task) {
    this.activeVideoTaskId = task.id;
    this.update(task.id, { status: 'running', stage: 'analyze', progress: 0, error: null });
    try {
      const result = await runVideoPipeline({
        db: this.db,
        storage: this.storage,
        videoId: task.entity_id,
        taskId: task.id,
        modelConfigs: readModelConfig(this.db),
        onProgress: (progress) => this.update(task.id, { status: 'running', ...progress })
      });
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: result });
    } catch (error) {
      // 分析失败不影响已经可用的压缩素材，用户可直接重新发起总结。
      this.db.run('UPDATE videos SET status = ?, error = ?, updated_at = ? WHERE id = ?', ['compressed', error.message, now(), task.entity_id]);
      this.update(task.id, { status: 'failed', stage: 'failed', error: error.message });
    } finally {
      this.activeVideoTaskId = null;
      this.running.delete(task.id);
      this.pump();
    }
  }

  async runCompression(task) {
    this.activeVideoTaskId = task.id;
    this.update(task.id, { status: 'running', stage: 'compress', progress: 0, error: null });
    // #region debug-point D:compression-task-start
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='video-compression-stall';try{const e=fs.readFileSync('.dbg/video-compression-stall.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'D',location:'task-manager.cjs:runCompression',msg:'[DEBUG] Compression task started',data:{taskId:task.id,videoId:task.entity_id},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    try {
      const result = await runCompressionPipeline({
        db: this.db,
        storage: this.storage,
        videoId: task.entity_id,
        onProgress: (progress) => this.update(task.id, { status: 'running', ...progress })
      });
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: result });
    } catch (error) {
      this.db.run('UPDATE videos SET status = ?, error = ?, updated_at = ? WHERE id = ?', ['failed', error.message, now(), task.entity_id]);
      this.update(task.id, { status: 'failed', stage: 'failed', error: error.message });
    } finally {
      this.activeVideoTaskId = null;
      this.running.delete(task.id);
      this.pump();
    }
  }

  async runVisionVideo(task) {
    this.activeVideoTaskId = task.id;
    this.update(task.id, { status: 'running', stage: 'vision-analyze', progress: 0, error: null });
    try {
      const result = await runVisionVideoPipeline({
        db: this.db,
        storage: this.storage,
        videoId: task.entity_id,
        modelConfigs: readModelConfig(this.db),
        onProgress: (progress) => this.update(task.id, { status: 'running', ...progress }),
      });
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: result });
    } catch (error) {
      // #region debug-point E:vision-task-failure
      (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='vision-analysis-error';try{const e=fs.readFileSync('.dbg/vision-analysis-error.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'task-manager.cjs:runVisionVideo',msg:'[DEBUG] Vision analysis task failed',data:{videoId:task.entity_id,error:String(error?.message||error)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      this.db.run('UPDATE videos SET status = ?, error = ?, updated_at = ? WHERE id = ?', ['compressed', error.message, now(), task.entity_id]);
      this.update(task.id, { status: 'failed', stage: 'failed', error: error.message });
    } finally {
      this.activeVideoTaskId = null;
      this.running.delete(task.id);
      this.pump();
    }
  }

  async runTranscript(task) {
    this.activeVideoTaskId = task.id;
    this.update(task.id, { status: 'running', stage: 'extract-audio', progress: 0, error: null });
    try {
      const result = await runTranscriptPipeline({
        db: this.db,
        storage: this.storage,
        videoId: task.entity_id,
        modelConfigs: readModelConfig(this.db),
        onProgress: (progress) => this.update(task.id, { status: 'running', ...progress }),
      });
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: result });
    } catch (error) {
      this.update(task.id, { status: 'failed', stage: 'failed', error: error.message });
    } finally {
      this.activeVideoTaskId = null;
      this.running.delete(task.id);
      this.pump();
    }
  }

  async runClip(task) {
    this.update(task.id, { status: 'running', stage: 'render', progress: 0.1, error: null });
    try {
      const metadata = task.metadata_json ? JSON.parse(task.metadata_json) : {};
      if (metadata.preview) { await this.runPreviewClip(task, metadata); return; }
      const video = this.db.get('SELECT * FROM videos WHERE id = ?', [task.entity_id]);
      if (!video || video.status !== 'ready') throw new Error('视频尚未完成分析');
      const allScenes = this.db.all('SELECT * FROM scenes WHERE video_id = ? ORDER BY scene_index', [task.entity_id]);
      const frames = this.db.all('SELECT k.* FROM keyframes k JOIN scenes s ON s.id = k.scene_id WHERE s.video_id = ? ORDER BY s.scene_index, k.frame_index', [task.entity_id]);
      const selections = metadata.selections || {};
      const transcriptEdits = metadata.transcripts || {};
      const scenes = allScenes
        .filter((scene) => Array.isArray(selections[scene.id]) && selections[scene.id].length > 0)
        .map((scene) => ({ ...scene, transcript: transcriptEdits[scene.id] ?? scene.transcript }));
      if (!scenes.length) throw new Error('请至少选择一个场景和关键帧');
      const frameRowsByScene = Object.fromEntries(scenes.map((scene) => {
        const selected = selections[scene.id];
        const sceneFrames = frames.filter((frame) => frame.scene_id === scene.id);
        return [scene.id, sceneFrames.filter((frame) => selected.includes(frame.id) || selected.includes(frame.frame_index))];
      }));
      const clipId = id('clip');
      const result = await createClipPdf({ clipId, video, scenes, frameRowsByScene, storage: this.storage, settings: metadata.settings || {} });
      this.db.run('INSERT INTO clips (id, video_id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [clipId, task.entity_id, `${video.name.replace(/\.[^/.]+$/, '')} · 游学片段`, result.path, result.pageCount, JSON.stringify({ selections, transcripts: transcriptEdits, settings: metadata.settings || {} }), now()]);
      this.db.run('UPDATE videos SET analysis_status = ?, updated_at = ? WHERE id = ?', ['confirmed', now(), task.entity_id]);
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: { clipId, ...result } });
    } catch (error) {
      this.update(task.id, { status: 'failed', stage: 'failed', error: error.message });
    } finally { this.running.delete(task.id); this.pump(); }
  }

  async runPreviewClip(task, metadata) {
    const selections = metadata.selections || {};
    const transcripts = metadata.transcripts || {};
    const selectedScenes = SAMPLE_SCENES
      .filter((scene) => Array.isArray(selections[scene.clientId]) && selections[scene.clientId].length > 0)
      .map((scene) => ({ ...scene, transcript: transcripts[scene.clientId] || scene.summary }));
    if (!selectedScenes.length) throw new Error('请至少选择一个场景和关键帧');
    const clipId = id('clip');
    const result = await createClipPdf({ clipId, video: { id: SAMPLE_VIDEO_ID }, scenes: selectedScenes, frameRowsByScene: new Map(), storage: this.storage, settings: metadata.settings || {} });
    const normalizedSelections = Object.fromEntries(selectedScenes.map((scene) => [scene.id, selections[scene.clientId]]));
    const normalizedTranscripts = Object.fromEntries(selectedScenes.map((scene) => [scene.id, scene.transcript]));
    this.db.run('INSERT INTO clips (id, video_id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [clipId, SAMPLE_VIDEO_ID, '植物园游学_上午 · 临时笔记', result.path, result.pageCount, JSON.stringify({ selections: normalizedSelections, transcripts: normalizedTranscripts, settings: metadata.settings || {}, preview: true }), now()]);
    this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: { clipId, ...result } });
  }

  async runNote(task) {
    this.update(task.id, { status: 'running', stage: 'merge', progress: 0.1, error: null });
    try {
      const metadata = task.metadata_json ? JSON.parse(task.metadata_json) : {};
      const clipIds = Array.isArray(metadata.clipIds) ? metadata.clipIds : [];
      if (!clipIds.length) throw new Error('至少选择一个临时笔记');
      const clips = clipIds.map((clipId) => this.db.get('SELECT * FROM clips WHERE id = ? AND deleted = 0', [clipId])).filter(Boolean);
      if (clips.length !== clipIds.length) throw new Error('存在未找到的临时笔记');
      const noteId = id('note');
      const result = await mergeClipPdfs({ noteId, clipPaths: clips.map((clip) => clip.path), storage: this.storage });
      this.db.run('INSERT INTO notes (id, notebook_id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [noteId, DEFAULT_NOTEBOOK_ID, `研学笔记 · ${new Date().toLocaleDateString('zh-CN')}`, result.path, result.pageCount, JSON.stringify({ clipIds, cover: metadata.cover || 'first' }), now()]);
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: { noteId, ...result } });
    } catch (error) { this.update(task.id, { status: 'failed', stage: 'failed', error: error.message }); }
    finally { this.running.delete(task.id); this.pump(); }
  }

  pump() {
    const tasks = this.db.all("SELECT * FROM tasks WHERE status = 'queued' ORDER BY created_at");
    for (const task of tasks) {
      if (this.running.has(task.id)) continue;
      if ((task.kind === 'video-analysis' || task.kind === 'video-vision-analysis' || task.kind === 'video-compress' || task.kind === 'video-transcript') && this.activeVideoTaskId) continue;
      this.running.add(task.id);
      if (task.kind === 'video-compress') this.runCompression(task);
      else if (task.kind === 'video-analysis') this.runVideo(task);
      else if (task.kind === 'video-vision-analysis') this.runVisionVideo(task);
      else if (task.kind === 'video-transcript') this.runTranscript(task);
      else if (task.kind === 'clip-pdf') this.runClip(task);
      else if (task.kind === 'note-merge') this.runNote(task);
    }
  }

  retry(taskId, mode = 'checkpoint') {
    const task = this.task(taskId);
    if (!task || task.status !== 'failed') return task;
    if (mode === 'full' && task.kind === 'video-analysis') {
      this.db.run('DELETE FROM keyframes WHERE scene_id IN (SELECT id FROM scenes WHERE video_id = ?)', [task.entity_id]);
      this.db.run('DELETE FROM scenes WHERE video_id = ?', [task.entity_id]);
      this.db.run('UPDATE videos SET status = ?, error = ?, audio_path = ?, transcript_path = ?, updated_at = ? WHERE id = ?', ['compressed', null, null, null, now(), task.entity_id]);
    }
    this.update(taskId, { status: 'queued', stage: mode === 'full' ? 'compress' : task.stage === 'failed' ? 'queued' : task.stage, progress: mode === 'full' ? 0 : task.progress, error: null, metadata: { ...(task.metadata_json ? JSON.parse(task.metadata_json) : {}), retryMode: mode } });
    this.pump(); return this.task(taskId);
  }
}

module.exports = { TaskManager };
