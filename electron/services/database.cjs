const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_size INTEGER,
  source_mtime TEXT,
  duration REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  proxy_path TEXT,
  audio_path TEXT,
  transcript_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  scene_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS keyframes (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  frame_index INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id)
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_video ON scenes(video_id, scene_index);
CREATE INDEX IF NOT EXISTS idx_keyframes_scene ON keyframes(scene_id, frame_index);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at);
`;

class Database {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
    this.savePromise = Promise.resolve();
  }

  async init() {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
    this.db = fs.existsSync(this.filePath)
      ? new SQL.Database(fs.readFileSync(this.filePath))
      : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    await this.save();
    return this;
  }

  assertReady() {
    if (!this.db) throw new Error('Database has not been initialized');
  }

  run(sql, params = []) {
    this.assertReady();
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      statement.step();
    } finally {
      statement.free();
    }
    return this.save();
  }

  all(sql, params = []) {
    this.assertReady();
    const statement = this.db.prepare(sql);
    const rows = [];
    try {
      statement.bind(params);
      while (statement.step()) rows.push(statement.getAsObject());
    } finally {
      statement.free();
    }
    return rows;
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] ?? null;
  }

  async save() {
    this.assertReady();
    const bytes = Buffer.from(this.db.export());
    this.savePromise = this.savePromise.then(async () => {
      const tempPath = `${this.filePath}.tmp`;
      await fsp.writeFile(tempPath, bytes);
      await fsp.rename(tempPath, this.filePath);
    });
    return this.savePromise;
  }
}

module.exports = { Database };
