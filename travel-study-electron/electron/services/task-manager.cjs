const crypto = require('node:crypto');
const { runVideoPipeline } = require('./pipeline.cjs');
const { createClipPdf, mergeClipPdfs } = require('./pdf.cjs');

const now = () => new Date().toISOString();
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
    const taskId = id('task-video');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'video-analysis', videoId, 'queued', 'queued', 0, null, JSON.stringify({ retryMode: 'checkpoint' }), now(), now()]
    );
    this.emit(taskId); this.pump(); return this.task(taskId);
  }

  createClipTask(videoId, selections, settings = {}) {
    const taskId = id('task-clip');
    this.db.run(
      'INSERT INTO tasks (id, kind, entity_id, status, stage, progress, error, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, 'clip-pdf', videoId, 'queued', 'queued', 0, null, JSON.stringify({ selections, settings }), now(), now()]
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
    const next = { ...current, ...patch, updated_at: now() };
    this.db.run(
      'UPDATE tasks SET status = ?, stage = ?, progress = ?, error = ?, metadata_json = ?, updated_at = ? WHERE id = ?',
      [next.status, next.stage, next.progress, next.error || null, typeof next.metadata_json === 'string' ? next.metadata_json : JSON.stringify(next.metadata || {}), next.updated_at, taskId]
    );
    this.emit(taskId);
  }

  async runVideo(task) {
    this.activeVideoTaskId = task.id;
    this.update(task.id, { status: 'running', stage: 'compress', progress: 0, error: null });
    try {
      const result = await runVideoPipeline({
        db: this.db,
        storage: this.storage,
        videoId: task.entity_id,
        taskId: task.id,
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

  async runClip(task) {
    this.update(task.id, { status: 'running', stage: 'render', progress: 0.1, error: null });
    try {
      const video = this.db.get('SELECT * FROM videos WHERE id = ?', [task.entity_id]);
      if (!video || video.status !== 'ready') throw new Error('视频尚未完成分析');
      const scenes = this.db.all('SELECT * FROM scenes WHERE video_id = ? ORDER BY scene_index', [task.entity_id]);
      const frames = this.db.all('SELECT k.* FROM keyframes k JOIN scenes s ON s.id = k.scene_id WHERE s.video_id = ? ORDER BY s.scene_index, k.frame_index', [task.entity_id]);
      const metadata = task.metadata_json ? JSON.parse(task.metadata_json) : {};
      const selections = metadata.selections || {};
      const frameRowsByScene = Object.fromEntries(scenes.map((scene) => {
        const selected = selections[scene.id];
        const sceneFrames = frames.filter((frame) => frame.scene_id === scene.id);
        return [scene.id, selected?.length ? sceneFrames.filter((frame) => selected.includes(frame.id) || selected.includes(frame.frame_index)) : sceneFrames];
      }));
      const clipId = id('clip');
      const result = await createClipPdf({ clipId, video, scenes, frameRowsByScene, storage: this.storage });
      this.db.run('INSERT INTO clips (id, video_id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [clipId, task.entity_id, `${video.name.replace(/\.[^/.]+$/, '')} · 研学片段`, result.path, result.pageCount, JSON.stringify({ selections, settings: metadata.settings || {} }), now()]);
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: { clipId, ...result } });
    } catch (error) {
      this.update(task.id, { status: 'failed', stage: 'failed', error: error.message });
    } finally { this.running.delete(task.id); this.pump(); }
  }

  async runNote(task) {
    this.update(task.id, { status: 'running', stage: 'merge', progress: 0.1, error: null });
    try {
      const metadata = task.metadata_json ? JSON.parse(task.metadata_json) : {};
      const clipIds = Array.isArray(metadata.clipIds) ? metadata.clipIds : [];
      if (!clipIds.length) throw new Error('至少选择一个游学片段');
      const clips = clipIds.map((clipId) => this.db.get('SELECT * FROM clips WHERE id = ?', [clipId])).filter(Boolean);
      if (clips.length !== clipIds.length) throw new Error('存在未找到的游学片段');
      const noteId = id('note');
      const result = await mergeClipPdfs({ noteId, clipPaths: clips.map((clip) => clip.path), storage: this.storage });
      this.db.run('INSERT INTO notes (id, name, path, page_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', [noteId, `研学笔记 · ${new Date().toLocaleDateString('zh-CN')}`, result.path, result.pageCount, JSON.stringify({ clipIds, cover: metadata.cover || 'first' }), now()]);
      this.update(task.id, { status: 'succeeded', stage: 'complete', progress: 1, metadata: { noteId, ...result } });
    } catch (error) { this.update(task.id, { status: 'failed', stage: 'failed', error: error.message }); }
    finally { this.running.delete(task.id); this.pump(); }
  }

  pump() {
    const tasks = this.db.all("SELECT * FROM tasks WHERE status = 'queued' ORDER BY created_at");
    for (const task of tasks) {
      if (this.running.has(task.id)) continue;
      if (task.kind === 'video-analysis' && this.activeVideoTaskId) continue;
      this.running.add(task.id);
      if (task.kind === 'video-analysis') this.runVideo(task);
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
      this.db.run('UPDATE videos SET status = ?, error = ?, proxy_path = ?, audio_path = ?, transcript_path = ?, updated_at = ? WHERE id = ?', ['queued', null, null, null, null, now(), task.entity_id]);
    }
    this.update(taskId, { status: 'queued', stage: mode === 'full' ? 'compress' : task.stage === 'failed' ? 'queued' : task.stage, progress: mode === 'full' ? 0 : task.progress, error: null, metadata: { ...(task.metadata_json ? JSON.parse(task.metadata_json) : {}), retryMode: mode } });
    this.pump(); return this.task(taskId);
  }
}

module.exports = { TaskManager };
