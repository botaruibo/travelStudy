const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const initSqlJs = require('sql.js');
const { Database, DEFAULT_NOTEBOOK_ID, DEFAULT_NOTEBOOK_NAME } = require('./database.cjs');
const { StorageService } = require('./storage.cjs');
const { TaskManager } = require('./task-manager.cjs');
const { NoteTemplateService } = require('./note-template-service.cjs');
const { CreditService } = require('./credit-service.cjs');
const { PermissionService } = require('./permission-service.cjs');
const { UserService } = require('./user-service.cjs');
const { readModelConfig, saveModelConfig, migrateModelConfigSecrets, ensureVolcenginePlanAsrConfig, modelConfigForDisplay } = require('./model-config.cjs');
const { SAMPLE_VIDEO_ID, ensureSampleData } = require('./sample-data.cjs');
const { ensureBundledInitialData, reconcileBundledInitialDataPaths } = require('./initial-data-service.cjs');
const { nowInChina, normalizeChinaTimestamp, toChinaTimeString } = require('./time.cjs');
const crypto = require('node:crypto');
// #region debug-point C:init-stage-observability
const reportInitDebug = (stage, data = {}) => { fetch('http://127.0.0.1:7778/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'electron-startup-failure', runId: 'post-fix', hypothesisId: 'C', location: 'electron/services/app-service.cjs', msg: `[DEBUG] initialization ${stage}`, data, ts: Date.now() }) }).catch(() => {}); };
// #endregion

function parseMetadata(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function rowsFromDatabase(db, sql) {
  const result = db.exec(sql)[0];
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])));
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map((part) => String(part).padStart(2, '0')).join(':');
}

class AppService {
  constructor({ rootDir, onTaskUpdate, sampleVideoPath, legacyDbPath }) {
    this.db = new Database(path.join(rootDir, 'travel-study.sqlite'));
    this.storage = new StorageService(rootDir);
    this.tasks = new TaskManager({ db: this.db, storage: this.storage, onUpdate: onTaskUpdate });
    this.noteTemplates = new NoteTemplateService(this.storage);
    this.credits = new CreditService(this.db);
    this.permissions = new PermissionService({ db: this.db, creditService: this.credits });
    this.users = new UserService(this.db);
    this.sampleVideoPath = sampleVideoPath;
    this.legacyDbPath = legacyDbPath;
  }
  async init() {
    await ensureBundledInitialData({ rootDir: this.storage.rootPath });
    // #region debug-point C:database-init
    reportInitDebug('database-start');
    // #endregion
    await this.db.init();
    reconcileBundledInitialDataPaths({ db: this.db, storage: this.storage, rootDir: this.storage.rootPath });
    // #region debug-point C:users-init
    reportInitDebug('database-complete');
    // #endregion
    await this.users.init();
    this.credits.ensureDefaultAccount();
    this.credits.verifyRedeemPublicKey();
    await this.credits.removeLegacyRechargeKey();
    // #region debug-point C:system-config
    reportInitDebug('user-and-credit-complete');
    // #endregion
    await this.ensureSystemConfig();
    await this.storage.init({ db: this.db });
    await this.noteTemplates.init();
    // #region debug-point C:legacy-import
    reportInitDebug('storage-and-template-complete');
    // #endregion
    await this.importLegacyData();
    await this.reconcileImportedLegacyPaths();
    this.db.migrateTimestampsToChina();
    // #region debug-point C:model-config
    reportInitDebug('legacy-migration-complete');
    // #endregion
    await migrateModelConfigSecrets(this.db);
    await ensureVolcenginePlanAsrConfig(this.db);
    // #region debug-point C:sample-data
    reportInitDebug('model-config-complete');
    // #endregion
    await ensureSampleData({ db: this.db, storage: this.storage, sampleVideoPath: this.sampleVideoPath });
    await this.reconcileCompressedVideoNames();
    await this.reconcileGeneratedTranscripts();
    // #region debug-point C:database-save
    reportInitDebug('reconciliation-complete');
    // #endregion
    await this.db.save();
    this.tasks.init();
    // #region debug-point C:init-complete
    reportInitDebug('complete');
    // #endregion
  }
  async ensureSystemConfig() {
    if (this.db.get('SELECT config_key FROM system_config WHERE config_key = ?', ['systemConfig'])) return;
    const stamp = nowInChina();
    await this.db.run('INSERT INTO system_config (config_key, value_json, created_at, updated_at) VALUES (?, ?, ?, ?)', ['systemConfig', JSON.stringify({ schemaVersion: 1, creditEnabled: true }), stamp, stamp]);
  }
  legacyRootDir() { return this.legacyDbPath ? path.dirname(this.legacyDbPath) : ''; }
  remapLegacyAssetPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return filePath;
    const legacyRoot = this.legacyRootDir();
    const normalized = this.storage.replacePath(filePath, []);
    if (legacyRoot && (normalized === legacyRoot || normalized.startsWith(`${legacyRoot}${path.sep}`))) return `${this.storage.rootPath}${normalized.slice(legacyRoot.length)}`;
    return normalized;
  }
  async copyLegacyAssetIfNeeded(sourcePath, targetPath) {
    if (!sourcePath || !targetPath || sourcePath === targetPath || !fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
    await this.storage.ensureParent(targetPath);
    await fsp.copyFile(sourcePath, targetPath);
  }
  async reconcileImportedLegacyPaths() {
    const legacyRoot = this.legacyRootDir();
    if (!legacyRoot || path.resolve(legacyRoot) === path.resolve(this.storage.rootPath)) return;
    const fields = [
      ['videos', 'id', ['proxy_path', 'audio_path', 'transcript_path', 'subtitle_path']],
      ['keyframes', 'id', ['path']],
      ['clips', 'id', ['path']],
      ['notes', 'id', ['path']],
    ];
    for (const [table, idColumn, columns] of fields) {
      for (const row of this.db.all(`SELECT ${idColumn}, ${columns.join(', ')} FROM ${table}`)) {
        const updates = [];
        const params = [];
        for (const column of columns) {
          const current = row[column];
          const next = this.remapLegacyAssetPath(current);
          if (next === current) continue;
          await this.copyLegacyAssetIfNeeded(current, next);
          updates.push(`${column} = ?`);
          params.push(next);
        }
        if (updates.length) await this.db.run(`UPDATE ${table} SET ${updates.join(', ')} WHERE ${idColumn} = ?`, [...params, row[idColumn]]);
      }
    }
    this.storage.migrateDatabasePaths(this.db, [[legacyRoot, this.storage.rootPath]]);
  }
  async importLegacyData() {
    if (!this.legacyDbPath || path.resolve(this.legacyDbPath) === path.resolve(this.db.filePath) || !fs.existsSync(this.legacyDbPath)) return;
    try {
      const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
      const legacy = new SQL.Database(fs.readFileSync(this.legacyDbPath));
      const videoRows = rowsFromDatabase(legacy, 'SELECT * FROM videos');
      for (const video of videoRows) {
        if (this.db.get('SELECT id FROM videos WHERE id = ?', [video.id])) continue;
        await this.db.run('INSERT INTO videos (id, name, source_path, source_size, source_mtime, duration, status, proxy_path, audio_path, transcript_path, subtitle_path, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [video.id, video.name, video.source_path, video.source_size, normalizeChinaTimestamp(video.source_mtime), video.duration, video.status, video.proxy_path, video.audio_path, video.transcript_path, video.subtitle_path || null, video.error, normalizeChinaTimestamp(video.created_at), normalizeChinaTimestamp(video.updated_at)]);
      }
      for (const scene of rowsFromDatabase(legacy, 'SELECT * FROM scenes')) {
        if (this.db.get('SELECT id FROM scenes WHERE id = ?', [scene.id])) continue;
        await this.db.run('INSERT INTO scenes (id, video_id, scene_index, title, start_sec, end_sec, summary, transcript, study_advice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [scene.id, scene.video_id, scene.scene_index, scene.title, scene.start_sec, scene.end_sec, scene.summary, scene.transcript, scene.study_advice || '', normalizeChinaTimestamp(scene.created_at)]);
      }
      for (const frame of rowsFromDatabase(legacy, 'SELECT * FROM keyframes')) {
        if (this.db.get('SELECT id FROM keyframes WHERE id = ?', [frame.id])) continue;
        await this.db.run('INSERT INTO keyframes (id, scene_id, frame_index, timestamp_sec, path, created_at) VALUES (?, ?, ?, ?, ?, ?)', [frame.id, frame.scene_id, frame.frame_index, frame.timestamp_sec, frame.path, normalizeChinaTimestamp(frame.created_at)]);
      }
      for (const clip of rowsFromDatabase(legacy, 'SELECT * FROM clips')) {
        if (this.db.get('SELECT id FROM clips WHERE id = ?', [clip.id])) continue;
        await this.db.run('INSERT INTO clips (id, video_id, name, path, page_count, deleted, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [clip.id, clip.video_id, clip.name, clip.path, clip.page_count, clip.deleted || 0, clip.metadata_json || '{}', normalizeChinaTimestamp(clip.created_at)]);
      }
      for (const note of rowsFromDatabase(legacy, 'SELECT * FROM notes')) {
        if (this.db.get('SELECT id FROM notes WHERE id = ?', [note.id])) continue;
        await this.db.run('INSERT INTO notes (id, notebook_id, name, path, page_count, deleted, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [note.id, note.notebook_id || DEFAULT_NOTEBOOK_ID, note.name, note.path, note.page_count, note.deleted || 0, note.metadata_json || '{}', normalizeChinaTimestamp(note.created_at)]);
      }
      for (const config of rowsFromDatabase(legacy, 'SELECT * FROM system_config')) {
        if (this.db.get('SELECT config_key FROM system_config WHERE config_key = ?', [config.config_key])) continue;
        await this.db.run(
          'INSERT INTO system_config (config_key, value_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [config.config_key, config.value_json, normalizeChinaTimestamp(config.created_at) || nowInChina(), normalizeChinaTimestamp(config.updated_at) || nowInChina()]
        );
      }
      await this.db.savePromise;
    } catch {
      // 历史数据导入失败不应阻止应用使用当前数据库启动。
    }
  }
  uniqueCompressedVideoName(name, videoId, reserved = new Set()) {
    const desired = this.storage.compressedVideoFileName(name, videoId);
    const parsed = path.parse(desired);
    let candidate = desired;
    let suffix = 2;
    while (reserved.has(candidate.toLocaleLowerCase())) {
      candidate = `${parsed.name} (${suffix})${parsed.ext}`;
      suffix += 1;
    }
    reserved.add(candidate.toLocaleLowerCase());
    return candidate;
  }
  async reconcileCompressedVideoNames() {
    const rows = this.db.all('SELECT id, name, proxy_path FROM videos ORDER BY created_at, id');
    const reserved = new Set(fs.existsSync(this.storage.paths.proxy) ? fs.readdirSync(this.storage.paths.proxy).map((name) => name.toLocaleLowerCase()) : []);
    const trackedPaths = new Set();

    for (const row of rows) {
      const currentPath = row.proxy_path && fs.existsSync(row.proxy_path)
        ? row.proxy_path
        : this.storage.legacyProxyPath(row.id);
      const hasCompressedFile = fs.existsSync(currentPath);
      const currentFileName = hasCompressedFile ? path.basename(currentPath).toLocaleLowerCase() : '';
      if (currentFileName) reserved.delete(currentFileName);
      const fileName = this.uniqueCompressedVideoName(row.name, row.id, reserved);
      const proxyPath = this.storage.proxyPath(fileName, row.id);
      if (hasCompressedFile && path.resolve(currentPath) !== path.resolve(proxyPath)) {
        await this.storage.ensureParent(proxyPath);
        await fsp.rename(currentPath, proxyPath);
      }
      if (hasCompressedFile) trackedPaths.add(path.resolve(proxyPath));
      this.db.run(
        'UPDATE videos SET name = ?, proxy_path = ? WHERE id = ?',
        [fileName, hasCompressedFile ? proxyPath : null, row.id]
      );
    }

    const orphanFolder = path.join(this.storage.paths.proxy, '.untracked');
    for (const entry of await fsp.readdir(this.storage.paths.proxy, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = path.join(this.storage.paths.proxy, entry.name);
      if (trackedPaths.has(path.resolve(filePath))) continue;

      await fsp.mkdir(orphanFolder, { recursive: true });
      const parsed = path.parse(entry.name);
      let targetPath = path.join(orphanFolder, entry.name);
      let suffix = 2;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(orphanFolder, `${parsed.name} (${suffix})${parsed.ext}`);
        suffix += 1;
      }
      await fsp.rename(filePath, targetPath);
    }
  }
  async reconcileGeneratedTranscripts() {
    for (const video of this.db.all('SELECT id, audio_path, transcript_path, subtitle_path FROM videos')) {
      const transcriptPath = this.storage.transcriptPath(video.id);
      const subtitlePath = this.storage.subtitlePath(video.id);
      const hasTranscript = fs.existsSync(transcriptPath) && fs.statSync(transcriptPath).size > 0;
      const hasSubtitle = fs.existsSync(subtitlePath) && fs.statSync(subtitlePath).size > 0;
      const updates = [];
      const params = [];
      if (!video.transcript_path && hasTranscript) {
        updates.push('transcript_path = ?');
        params.push(transcriptPath);
      }
      if (!video.subtitle_path && hasSubtitle) {
        updates.push('subtitle_path = ?');
        params.push(subtitlePath);
      }
      if (updates.length) {
        updates.push('updated_at = ?');
        params.push(nowInChina(), video.id);
        this.db.run(`UPDATE videos SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    }
  }
  addVideo({ sourcePath, name }) {
    const stat = fs.statSync(sourcePath);
    const videoId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reserved = new Set(this.db.all('SELECT name FROM videos').map((video) => String(video.name).toLocaleLowerCase()));
    const fileName = this.uniqueCompressedVideoName(name || path.basename(sourcePath), videoId, reserved);
    const stamp = nowInChina();
    this.db.run('INSERT INTO videos (id, name, source_path, source_size, source_mtime, status, proxy_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [videoId, fileName, sourcePath, stat.size, toChinaTimeString(stat.mtime), 'queued', this.storage.proxyPath(fileName, videoId), stamp, stamp]);
    return { video: this.db.get('SELECT id, name, source_size, source_mtime, status, created_at FROM videos WHERE id = ?', [videoId]) };
  }
  useSampleVideo(sourcePath) { return this.addVideo({ sourcePath, name: path.basename(sourcePath) }); }
  compressVideo(videoId) { return this.tasks.createCompressionTask(videoId); }
  getCompressedVideoFolder() { return this.storage.paths.proxy; }
  getModelConfig() { this.users.requireResource('menu.ai-config'); return modelConfigForDisplay(readModelConfig(this.db)); }
  async saveModelConfig(config) {
    this.users.requireResource('menu.ai-config');
    await saveModelConfig(this.db, config);
    return { config: this.getModelConfig() };
  }
  getDefaultNotebook() {
    return this.db.get(
      `SELECT nb.id, nb.name, nb.is_default, COUNT(n.id) AS note_count, MAX(n.created_at) AS last_note_created_at
       FROM notebooks nb
       LEFT JOIN notes n ON n.notebook_id = nb.id AND n.deleted = 0
       WHERE nb.is_default = 1
       GROUP BY nb.id, nb.name, nb.is_default
       ORDER BY nb.created_at
       LIMIT 1`
    ) || { id: DEFAULT_NOTEBOOK_ID, name: DEFAULT_NOTEBOOK_NAME, is_default: 1, note_count: 0, last_note_created_at: null };
  }
  getOverviewStats() {
    return {
      video_count: Number(this.db.get('SELECT COUNT(*) AS count FROM videos')?.count || 0),
      ready_video_count: Number(this.db.get("SELECT COUNT(*) AS count FROM videos WHERE status = 'ready'")?.count || 0),
      scene_count: Number(this.db.get('SELECT COUNT(*) AS count FROM scenes')?.count || 0),
    };
  }
  async checkPermission(payload) {
    try {
      this.users.requireResource(payload?.actionId);
    } catch (error) {
      return { available: false, actionId: payload?.actionId, code: 'RESOURCE_FORBIDDEN', message: error.message || '当前账号没有该功能权限' };
    }
    return this.permissions.checkAvailability(payload || {});
  }
  getCreditSummary() { this.users.requireResource('menu.credits'); return this.credits.getBalanceSummary(); }
  redeemCreditCode(code) { this.users.requireResource('action.credits.redeem'); return this.credits.redeemCode(code); }
  listCreditRechargeRecords(query) { this.users.requireResource('menu.credits'); return this.credits.listRechargeRecords(query); }
  listCreditConsumptionRecords(query) { this.users.requireResource('menu.credits'); return this.credits.listConsumptionRecords(query); }
  login(username, password) {
    const session = this.users.login(username, password);
    if (!session) throw new Error('用户名或密码不正确');
    return session;
  }
  logout() { return this.users.logout(); }
  getSession() { return this.users.session(); }
  getProfile() {
    const session = this.users.session();
    if (!session) throw new Error('请先登录');
    return session.user;
  }
  async updateProfile(payload) { return this.users.updateProfile(payload); }
  listUsersWithPermissions() {
    this.users.requireResource('menu.permissions');
    return { users: this.users.listUsers(), resources: this.users.listResources() };
  }
  async updateUserPermissions(payload) {
    this.users.requireResource('action.permissions.manage');
    return this.users.setPermissions(payload?.userId, payload?.resourceIds);
  }
  async setProfileAvatarFromFile(sourcePath) {
    this.users.requireResource('action.profile.save');
    const extension = path.extname(String(sourcePath || '')).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('头像仅支持 PNG、JPG 或 WebP 格式');
    const stat = await fsp.stat(sourcePath);
    if (stat.size > 5 * 1024 * 1024) throw new Error('头像文件不能超过 5MB');
    const target = path.join(this.storage.rootPath, 'avatars', `${this.users.requireCurrentUser().id}${extension}`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(sourcePath, target);
    return this.users.updateProfile({ avatarPath: target });
  }
  async summarizeVideo(videoId, method = 'audio', requestId) {
    const video = this.db.get('SELECT id, status FROM videos WHERE id = ?', [videoId]);
    if (!video) throw new Error('视频不存在');
    if (video.status !== 'compressed' && video.status !== 'ready') throw new Error('请先完成视频压缩');
    const actionId = method === 'vision' ? 'video.analyze.vision' : method === 'audio' ? 'video.analyze.audio' : null;
    const buttonId = method === 'vision' ? 'analyze-vision' : 'analyze-audio';
    if (!actionId || typeof requestId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId)) return { ok: false, code: 'ACTION_NOT_CONFIGURED', message: '此功能的权限策略尚未配置，暂时无法使用。' };
    this.users.requireResource(actionId);
    const existing = this.db.get('SELECT * FROM tasks WHERE request_id = ?', [requestId]);
    if (existing) {
      const metadata = parseMetadata(existing.metadata_json);
      if (existing.entity_id !== videoId || metadata.actionId !== actionId) return { ok: false, code: 'ACTION_NOT_CONFIGURED', message: '请求参数与已提交任务不一致。' };
      return existing;
    }
    const failedTask = this.db.all(
      `SELECT * FROM tasks
       WHERE entity_id = ? AND kind = ? AND status = 'failed'
       ORDER BY updated_at DESC LIMIT 1`,
      [videoId, method === 'vision' ? 'video-vision-analysis' : 'video-analysis']
    ).find((task) => parseMetadata(task.metadata_json).actionId === actionId);
    if (failedTask) return this.tasks.retry(failedTask.id, 'checkpoint');
    const permission = await this.permissions.checkAvailability({ actionId, buttonId, context: { videoId } });
    if (!permission.available) return { ok: false, ...permission };
    const taskId = `task-${method === 'vision' ? 'video-vision' : 'video'}-${crypto.randomUUID()}`;
    let task;
    try {
      task = await this.db.transaction(() => {
        const repeated = this.db.get('SELECT * FROM tasks WHERE request_id = ?', [requestId]);
        if (repeated) return repeated;
        const consumed = this.credits.consume({
          actionId,
          buttonId,
          creditUnits: permission.costUnits,
          taskId,
          metadata: { videoId, method, requestId, pricingVersion: 1 },
        });
        if (!consumed.ok) throw new Error(consumed.code);
        return this.tasks.createProtectedAnalysisTask({ taskId, requestId, videoId, method, metadata: { actionId, buttonId, method, requestId, costUnits: permission.costUnits, retryMode: 'checkpoint' } });
      });
    } catch (error) {
      if (error.message === 'CREDIT_INSUFFICIENT') return { ok: false, code: error.message, message: '积分不足，请前往积分管理兑换。' };
      throw error;
    }
    this.tasks.emit(task.id);
    this.tasks.schedule();
    return task;
  }
  analyzeVideo(videoId) { return this.summarizeVideo(videoId, 'audio', crypto.randomUUID()); }
  generateSceneTranscripts(videoId) {
    const video = this.db.get('SELECT id, status FROM videos WHERE id = ?', [videoId]);
    if (!video) throw new Error('视频不存在');
    if (video.status !== 'ready' && video.status !== 'compressed') throw new Error('请先完成视频压缩');
    return this.tasks.createTranscriptTask(videoId);
  }
  async deleteVideo(videoId) {
    const video = this.db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
    if (!video) return { ok: false, reason: '视频不存在' };
    // 只移除视频索引记录，保留任务、场景、关键帧、片段、笔记及所有生成文件。
    // 现有 schema 的关联字段为 NOT NULL，因此临时关闭外键校验以保留关联数据。
    this.db.run('PRAGMA foreign_keys = OFF');
    this.db.run('DELETE FROM videos WHERE id = ?', [videoId]);
    this.db.run('PRAGMA foreign_keys = ON');
    return { ok: true, videoId };
  }
  listVideos() { return this.db.all('SELECT id, name, source_path, proxy_path, source_size, source_mtime, duration, status, subtitle_path, analysis_status, analysis_metadata_json, error, created_at, updated_at FROM videos ORDER BY created_at DESC').map((video) => ({ ...video, analysis_metadata: parseMetadata(video.analysis_metadata_json), is_sample: video.id === SAMPLE_VIDEO_ID, proxy_size: video.proxy_path && fs.existsSync(video.proxy_path) ? fs.statSync(video.proxy_path).size : 0 })); }
  getScenes(videoId) { return this.db.all('SELECT * FROM scenes WHERE video_id = ? ORDER BY scene_index', [videoId]).map((scene) => ({ ...scene, keyframes: this.db.all('SELECT id, scene_id, frame_index, timestamp_sec, keyword, path FROM keyframes WHERE scene_id = ? ORDER BY frame_index', [scene.id]) })); }
  async replaceKeyframe({ keyframeId, timestampSec, imageData }) {
    const frame = this.db.get(
      `SELECT k.id, k.path, s.video_id
       FROM keyframes k
       JOIN scenes s ON s.id = k.scene_id
       WHERE k.id = ?`,
      [keyframeId]
    );
    if (!frame) throw new Error('关键帧不存在');
    const timestamp = Number(timestampSec);
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('关键帧时间无效');
    const match = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(imageData || ''));
    if (!match) throw new Error('截图数据无效');
    const image = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    if (!image.length || image.length > 20 * 1024 * 1024) throw new Error('截图文件无效');
    await this.storage.ensureParent(frame.path);
    await fsp.writeFile(frame.path, image);
    await this.db.run('UPDATE keyframes SET timestamp_sec = ? WHERE id = ?', [timestamp, keyframeId]);
    return this.db.get('SELECT id, scene_id, frame_index, timestamp_sec, keyword, path FROM keyframes WHERE id = ?', [keyframeId]);
  }
  listClips() {
    return this.db.all(
      `SELECT c.id, c.video_id, c.name, c.path, c.page_count, c.created_at, c.metadata_json, v.name AS source_name
       FROM clips c
       LEFT JOIN videos v ON v.id = c.video_id
       WHERE c.deleted = 0
       ORDER BY c.created_at DESC`
    ).map((clip) => {
      const metadata = parseMetadata(clip.metadata_json);
      return { ...clip, source: metadata.source || clip.source_name || clip.video_id, location: metadata.location || '', exists: fs.existsSync(clip.path) };
    });
  }
  getClipDetail(clipId) {
    if (typeof clipId !== 'string' || !clipId.trim()) throw new Error('临时笔记记录无效');
    const clip = this.db.get('SELECT * FROM clips WHERE id = ? AND deleted = 0', [clipId]);
    if (!clip) throw new Error('临时笔记不存在或已删除');
    const metadata = parseMetadata(clip.metadata_json);
    const selections = metadata.selections || {};
    const transcripts = metadata.transcripts || {};
    const allScenes = this.db.all('SELECT * FROM scenes WHERE video_id = ? ORDER BY scene_index', [clip.video_id]);
    const pages = allScenes
      .filter((scene) => Array.isArray(selections[scene.id]) && selections[scene.id].length > 0)
      .map((scene) => {
        const selected = selections[scene.id];
        const keyframes = this.db.all('SELECT id, scene_id, frame_index, timestamp_sec, keyword, path FROM keyframes WHERE scene_id = ? ORDER BY frame_index', [scene.id])
          .filter((frame) => selected.includes(frame.id) || selected.includes(frame.frame_index));
        return {
          ...scene,
          index: scene.scene_index,
          range: `${formatDuration(scene.start_sec)} – ${formatDuration(scene.end_sec)}`,
          transcript: transcripts[scene.id] ?? scene.transcript,
          keyframes
        };
      });
    return { clip: { ...clip, metadata_json: undefined, exists: fs.existsSync(clip.path) }, settings: metadata.settings || {}, pages };
  }
  deleteClip(clipId) {
    const clip = this.db.get('SELECT * FROM clips WHERE id = ? AND deleted = 0', [clipId]);
    if (!clip) return { ok: false, reason: '临时笔记不存在或已删除' };
    try {
      if (fs.existsSync(clip.path)) fs.unlinkSync(clip.path);
    } catch (error) {
      throw new Error(`无法删除 PDF 文件：${error.message}`);
    }
    this.db.run('UPDATE clips SET deleted = 1 WHERE id = ?', [clipId]);
    return { ok: true, clipId };
  }
  listNotes() {
    return this.db.all(
      `SELECT n.id, n.notebook_id, nb.name AS notebook_name, n.name, n.path, n.page_count, n.created_at
       FROM notes n
       LEFT JOIN notebooks nb ON nb.id = n.notebook_id
       WHERE n.deleted = 0
       ORDER BY n.created_at DESC`
    ).map((note) => ({ ...note, exists: fs.existsSync(note.path) }));
  }
  getNoteDetail(noteId) {
    const note = this.db.get('SELECT * FROM notes WHERE id = ? AND deleted = 0', [noteId]);
    if (!note) throw new Error('研学笔记不存在或已删除');
    const clipIds = parseMetadata(note.metadata_json).clipIds || [];
    const firstClip = clipIds.map((clipId) => this.db.get('SELECT id FROM clips WHERE id = ? AND deleted = 0', [clipId])).find(Boolean);
    if (!firstClip) return { note: { ...note, metadata_json: undefined, exists: fs.existsSync(note.path) }, settings: {}, pages: [] };
    const clipDetail = this.getClipDetail(firstClip.id);
    return { note: { ...note, metadata_json: undefined, exists: fs.existsSync(note.path) }, settings: clipDetail.settings, pages: clipDetail.pages };
  }
  deleteNote(noteId) {
    const note = this.db.get('SELECT * FROM notes WHERE id = ? AND deleted = 0', [noteId]);
    if (!note) return { ok: false, reason: '研学笔记不存在或已删除' };
    try {
      if (fs.existsSync(note.path)) fs.unlinkSync(note.path);
    } catch (error) {
      throw new Error(`无法删除 PDF 文件：${error.message}`);
    }
    this.db.run('UPDATE notes SET deleted = 1 WHERE id = ?', [noteId]);
    return { ok: true, noteId };
  }
  listTasks() { return this.tasks.list(); }
  listNoteTemplates() { this.users.requireResource('menu.template-manager'); return this.noteTemplates.list(); }
  importNoteTemplate(filePath) { this.users.requireResource('action.templates.manage'); return this.noteTemplates.importFile(filePath); }
  exportNoteTemplate(template, filePath) { this.users.requireResource('action.templates.manage'); return this.noteTemplates.exportFile(template, filePath); }
  retryTask(taskId, mode) { return this.tasks.retry(taskId, mode); }
  generateClip({ videoId, selections, settings, transcripts }) { return this.tasks.createClipTask(videoId, selections || {}, settings || {}, transcripts || {}); }
  generatePreviewClip({ selections, settings, transcripts }) { return this.tasks.createPreviewClipTask(selections || {}, settings || {}, transcripts || {}); }
  mergeNotes({ clipIds, cover }) { return this.tasks.createNoteTask(clipIds, cover); }
  artifactPath(kind, id) { return kind === 'clip' ? this.db.get('SELECT path FROM clips WHERE id = ? AND deleted = 0', [id])?.path : kind === 'note' ? this.db.get('SELECT path FROM notes WHERE id = ? AND deleted = 0', [id])?.path : null; }
}
module.exports = { AppService };
