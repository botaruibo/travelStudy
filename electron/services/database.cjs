const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { nowInChina, normalizeChinaTimestamp } = require('./time.cjs');

const DEFAULT_NOTEBOOK_ID = 'notebook-default';
const DEFAULT_NOTEBOOK_NAME = '默认笔记本';

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
  subtitle_path TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'draft',
  analysis_metadata_json TEXT NOT NULL DEFAULT '{}',
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
  study_advice TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS keyframes (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  frame_index INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  keyword TEXT NOT NULL DEFAULT '',
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
  deleted INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id)
);
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL DEFAULT '${DEFAULT_NOTEBOOK_ID}',
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(notebook_id) REFERENCES notebooks(id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE,
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
CREATE TABLE IF NOT EXISTS system_config (
  config_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_video ON scenes(video_id, scene_index);
CREATE INDEX IF NOT EXISTS idx_keyframes_scene ON keyframes(scene_id, frame_index);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at);
CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  account_key TEXT NOT NULL UNIQUE,
  balance_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_units >= 0),
  initial_granted_units INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_recharge_records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  redeem_code_id TEXT NOT NULL,
  redeem_code_hash TEXT NOT NULL,
  credit_units INTEGER NOT NULL CHECK (credit_units > 0),
  status TEXT NOT NULL DEFAULT 'succeeded',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES credit_accounts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_recharge_code ON credit_recharge_records(redeem_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_recharge_code_id ON credit_recharge_records(redeem_code_id);
CREATE TABLE IF NOT EXISTS credit_consumption_records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  button_id TEXT,
  credit_units INTEGER NOT NULL CHECK (credit_units > 0),
  task_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'committed',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES credit_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_credit_consumption_account_created ON credit_consumption_records(account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_path TEXT,
  is_superuser INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('menu', 'action')),
  parent_id TEXT,
  is_admin_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, resource_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_resource ON user_permissions(resource_id);
`;

class Database {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
    this.savePromise = Promise.resolve();
    this.transactionDepth = 0;
  }

  async init() {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
    this.db = fs.existsSync(this.filePath)
      ? new SQL.Database(fs.readFileSync(this.filePath))
      : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    // 兼容已经创建过 clips 表的本地数据库。
    const clipColumns = this.db.exec('PRAGMA table_info(clips)')[0]?.values?.map((row) => row[1]) || [];
    if (!clipColumns.includes('deleted')) this.db.exec('ALTER TABLE clips ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
    const noteColumns = this.db.exec('PRAGMA table_info(notes)')[0]?.values?.map((row) => row[1]) || [];
    if (!noteColumns.includes('deleted')) this.db.exec('ALTER TABLE notes ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
    if (!noteColumns.includes('notebook_id')) this.db.exec('ALTER TABLE notes ADD COLUMN notebook_id TEXT');
    const videoColumns = this.db.exec('PRAGMA table_info(videos)')[0]?.values?.map((row) => row[1]) || [];
    if (!videoColumns.includes('analysis_status')) this.db.exec("ALTER TABLE videos ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'draft'");
    if (!videoColumns.includes('analysis_metadata_json')) this.db.exec("ALTER TABLE videos ADD COLUMN analysis_metadata_json TEXT NOT NULL DEFAULT '{}'");
    if (!videoColumns.includes('subtitle_path')) this.db.exec('ALTER TABLE videos ADD COLUMN subtitle_path TEXT');
    const keyframeColumns = this.db.exec('PRAGMA table_info(keyframes)')[0]?.values?.map((row) => row[1]) || [];
    if (!keyframeColumns.includes('keyword')) this.db.exec("ALTER TABLE keyframes ADD COLUMN keyword TEXT NOT NULL DEFAULT ''");
    const sceneColumns = this.db.exec('PRAGMA table_info(scenes)')[0]?.values?.map((row) => row[1]) || [];
    if (!sceneColumns.includes('study_advice')) this.db.exec("ALTER TABLE scenes ADD COLUMN study_advice TEXT NOT NULL DEFAULT ''");
    const taskColumns = this.db.exec('PRAGMA table_info(tasks)')[0]?.values?.map((row) => row[1]) || [];
    if (!taskColumns.includes('request_id')) this.db.exec('ALTER TABLE tasks ADD COLUMN request_id TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_request_id ON tasks(request_id) WHERE request_id IS NOT NULL');
    const stamp = nowInChina();
    const notebook = this.db.prepare('INSERT OR IGNORE INTO notebooks (id, name, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    try {
      notebook.bind([DEFAULT_NOTEBOOK_ID, DEFAULT_NOTEBOOK_NAME, 1, stamp, stamp]);
      notebook.step();
    } finally {
      notebook.free();
    }
    const fillNotebook = this.db.prepare("UPDATE notes SET notebook_id = ? WHERE notebook_id IS NULL OR notebook_id = ''");
    try {
      fillNotebook.bind([DEFAULT_NOTEBOOK_ID]);
      fillNotebook.step();
    } finally {
      fillNotebook.free();
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id, created_at)');
    this.migrateTimestampsToChina();
    await this.save();
    return this;
  }

  migrateTimestampsToChina() {
    const tables = ['videos', 'scenes', 'keyframes', 'clips', 'notebooks', 'notes', 'tasks', 'system_config', 'users', 'resources', 'user_permissions'];
    for (const table of tables) {
      const schema = this.db.exec(`PRAGMA table_info(${table})`)[0]?.values || [];
      const idColumn = schema.find((row) => row[5] === 1)?.[1];
      const timeColumns = schema.map((row) => row[1]).filter((column) => /(_at|_mtime)$/.test(column));
      if (!idColumn || !timeColumns.length) continue;
      const rows = this.all(`SELECT ${idColumn}, ${timeColumns.join(', ')} FROM ${table}`);
      for (const row of rows) {
        const updates = [];
        const params = [];
        for (const column of timeColumns) {
          const normalized = normalizeChinaTimestamp(row[column]);
          if (normalized && normalized !== row[column]) {
            updates.push(`${column} = ?`);
            params.push(normalized);
          }
        }
        if (!updates.length) continue;
        params.push(row[idColumn]);
        const statement = this.db.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE ${idColumn} = ?`);
        try {
          statement.bind(params);
          statement.step();
        } finally {
          statement.free();
        }
      }
    }
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
    return this.transactionDepth ? undefined : this.save();
  }

  async transaction(work) {
    this.assertReady();
    if (this.transactionDepth) return work();
    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth += 1;
    try {
      const result = work();
      if (result && typeof result.then === 'function') throw new Error('Database transaction work must be synchronous');
      this.db.exec('COMMIT');
      this.transactionDepth -= 1;
      await this.save();
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      try { this.db.exec('ROLLBACK'); } catch { /* Transaction may already be closed. */ }
      throw error;
    }
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

module.exports = { Database, DEFAULT_NOTEBOOK_ID, DEFAULT_NOTEBOOK_NAME };
