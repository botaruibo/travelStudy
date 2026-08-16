const path = require('node:path');
const fs = require('node:fs');
const { Database } = require('./database.cjs');
const { StorageService } = require('./storage.cjs');
const { TaskManager } = require('./task-manager.cjs');

class AppService {
  constructor({ rootDir, onTaskUpdate }) { this.db = new Database(path.join(rootDir, 'travel-study.sqlite')); this.storage = new StorageService(rootDir); this.tasks = new TaskManager({ db: this.db, storage: this.storage, onUpdate: onTaskUpdate }); }
  async init() { await this.db.init(); await this.storage.init(); this.tasks.init(); }
  addVideo({ sourcePath, name }) { const stat = fs.statSync(sourcePath); const videoId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; const stamp = new Date().toISOString(); this.db.run('INSERT INTO videos (id, name, source_path, source_size, source_mtime, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [videoId, name || path.basename(sourcePath), sourcePath, stat.size, stat.mtimeMs, 'queued', stamp, stamp]); return { video: this.db.get('SELECT id, name, source_size, source_mtime, status, created_at FROM videos WHERE id = ?', [videoId]), task: this.tasks.createVideoTask(videoId) }; }
  useSampleVideo(sourcePath) { return this.addVideo({ sourcePath, name: path.basename(sourcePath) }); }
  listVideos() { return this.db.all('SELECT id, name, source_size, source_mtime, duration, status, error, created_at, updated_at FROM videos ORDER BY created_at DESC'); }
  getScenes(videoId) { return this.db.all('SELECT * FROM scenes WHERE video_id = ? ORDER BY scene_index', [videoId]).map((scene) => ({ ...scene, keyframes: this.db.all('SELECT id, scene_id, frame_index, timestamp_sec FROM keyframes WHERE scene_id = ? ORDER BY frame_index', [scene.id]) })); }
  listClips() { return this.db.all('SELECT id, video_id, name, page_count, created_at FROM clips ORDER BY created_at DESC'); }
  listNotes() { return this.db.all('SELECT id, name, page_count, created_at FROM notes ORDER BY created_at DESC'); }
  listTasks() { return this.tasks.list(); }
  retryTask(taskId, mode) { return this.tasks.retry(taskId, mode); }
  generateClip({ videoId, selections, settings }) { return this.tasks.createClipTask(videoId, selections || {}, settings || {}); }
  mergeNotes({ clipIds, cover }) { return this.tasks.createNoteTask(clipIds, cover); }
  artifactPath(kind, id) { return kind === 'clip' ? this.db.get('SELECT path FROM clips WHERE id = ?', [id])?.path : kind === 'note' ? this.db.get('SELECT path FROM notes WHERE id = ?', [id])?.path : null; }
}
module.exports = { AppService };
