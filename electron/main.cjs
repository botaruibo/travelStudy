const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { app, BrowserWindow, dialog, ipcMain, session, shell, protocol } = require('electron');
const { AppService } = require('./services/app-service.cjs');
let mainWindow; let service; const rendererUrl = process.env.ELECTRON_RENDERER_URL;
// #region debug-point A:startup-observability
const reportStartupDebug = (hypothesisId, msg, data = {}) => { fetch('http://127.0.0.1:7778/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'electron-startup-failure', runId: 'post-fix', hypothesisId, location: 'electron/main.cjs', msg: `[DEBUG] ${msg}`, data, ts: Date.now() }) }).catch(() => {}); };
// #endregion
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true, stream: true } }]);
app.setName('研学笔记');
if (process.platform === 'win32') app.setAppUserModelId('com.travelstudy.desktop');
function assertSender(event) { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('无效的渲染进程请求'); }
function resolveRootDir() {
  const overrideRoot = process.env.TRAVEL_STUDY_USER_DATA_ROOT;
  if (overrideRoot) {
    fs.mkdirSync(overrideRoot, { recursive: true });
    return overrideRoot;
  }
  if (!app.isPackaged) return path.join(__dirname, '..', '.runtime', 'dev-user-data', 'travel-study');
  const preferredRoot = path.join(app.getPath('userData'), 'travel-study');
  const fallbackRoot = path.join(__dirname, '..', '.runtime', 'local-user-data', 'travel-study');
  try {
    fs.mkdirSync(preferredRoot, { recursive: true });
    const tempPath = path.join(preferredRoot, `.write-check-${process.pid}-${Date.now()}.tmp`);
    const targetPath = `${tempPath}.ready`;
    fs.writeFileSync(tempPath, '');
    fs.renameSync(tempPath, targetPath);
    fs.unlinkSync(targetPath);
    return preferredRoot;
  } catch {
    return fallbackRoot;
  }
}
function createWindow() {
  // #region debug-point E:create-window
  reportStartupDebug('E', 'creating browser window', { rendererUrl: rendererUrl || 'packaged-renderer' });
  // #endregion
  mainWindow = new BrowserWindow({ title: '研学笔记', width: 1440, height: 920, minWidth: 1180, minHeight: 720, backgroundColor: '#F5F5F0', show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  let revealed = false;
  const reveal = () => {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
    revealed = true;
    mainWindow.show();
    mainWindow.focus();
  };
  mainWindow.once('ready-to-show', reveal);
  // Some Windows sessions do not emit ready-to-show even after the renderer loads.
  // Keep the first paint visible instead of leaving a hidden process indefinitely.
  setTimeout(reveal, 1500);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' && target.hostname === 'm.tb.cn') void shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });
  if (rendererUrl) mainWindow.loadURL(rendererUrl); else mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  // #region debug-point D:renderer-load
  reportStartupDebug('D', 'renderer load requested', { rendererUrl: rendererUrl || 'packaged-renderer' });
  // #endregion
  mainWindow.on('closed', () => { mainWindow = null; });
}
function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => { assertSender(event); return fn(payload); });
  const pagination = (payload) => ({
    limit: Math.max(1, Math.min(100, Number(payload?.limit) || 20)),
    cursor: typeof payload?.cursor === 'string' && payload.cursor.length <= 64 ? payload.cursor : undefined,
  });
  handle('app:get-context', () => ({ platform: process.platform, version: app.getVersion(), storageMode: 'local-first' }));
  handle('auth:session', () => service.getSession());
  handle('auth:login', (payload) => {
    const username = String(payload?.username || '').trim();
    const password = String(payload?.password || '');
    if (!username || username.length > 64 || !password || password.length > 128) throw new Error('用户名或密码格式无效');
    return service.login(username, password);
  });
  handle('auth:logout', () => service.logout());
  handle('profile:get', () => service.getProfile());
  handle('profile:update', (payload) => service.updateProfile({
    username: typeof payload?.username === 'string' ? payload.username : undefined,
    displayName: typeof payload?.displayName === 'string' ? payload.displayName : undefined,
    password: typeof payload?.password === 'string' ? payload.password : undefined,
  }));
  handle('profile:pick-avatar', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择头像',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { user: await service.setProfileAvatarFromFile(result.filePaths[0]) };
  });
  handle('permissions:list', () => service.listUsersWithPermissions());
  handle('permissions:update', (payload) => service.updateUserPermissions(payload));
  handle('stats:overview', () => service.getOverviewStats());
  handle('config:model:get', () => service.getModelConfig());
  handle('config:model:save', (payload) => service.saveModelConfig(payload));
  handle('permission:check', (payload) => {
    if (!payload || typeof payload.actionId !== 'string' || payload.actionId.length > 128 || (payload.buttonId !== undefined && (typeof payload.buttonId !== 'string' || payload.buttonId.length > 128))) throw new Error('权限请求参数无效');
    return service.checkPermission({ actionId: payload.actionId, buttonId: payload.buttonId, context: typeof payload.context === 'object' && payload.context ? payload.context : {} });
  });
  handle('credits:summary', () => service.getCreditSummary());
  handle('credits:recharge', (code) => {
    if (typeof code !== 'string' || code.length > 8192) throw new Error('兑换码参数无效');
    return service.redeemCreditCode(code);
  });
  handle('credits:recharge-records', (query) => service.listCreditRechargeRecords(pagination(query)));
  handle('credits:consumption-records', (query) => service.listCreditConsumptionRecords(pagination(query)));
  handle('video:pick', async () => { const result = await dialog.showOpenDialog(mainWindow, { title: '导入游学视频', properties: ['openFile'], filters: [{ name: '视频', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv'] }] }); if (result.canceled || !result.filePaths[0]) return { canceled: true }; return service.addVideo({ sourcePath: result.filePaths[0], name: path.basename(result.filePaths[0]) }); });
  handle('video:use-sample', () => { const sourcePath = process.env.TRAVEL_STUDY_SAMPLE_VIDEO || path.join(__dirname, '..', 'example', 'sample-study.mp4'); if (!fs.existsSync(sourcePath)) throw new Error(`示例视频不存在：${sourcePath}`); return service.useSampleVideo(sourcePath); });
  handle('video:compress', (videoId) => service.compressVideo(videoId));
  handle('video:open-compressed-folder', async () => {
    const error = await shell.openPath(service.getCompressedVideoFolder());
    if (error) throw new Error(`无法打开压缩视频文件夹：${error}`);
    return { ok: true };
  });
  handle('video:summarize', (payload) => {
    if (!payload || typeof payload.videoId !== 'string' || payload.videoId.length > 256 || !['audio', 'vision'].includes(payload.method) || typeof payload.requestId !== 'string') throw new Error('视频分析参数无效');
    return service.summarizeVideo(payload.videoId, payload.method, payload.requestId);
  });
  handle('video:analyze', (videoId) => service.analyzeVideo(videoId));
  handle('video:generate-transcripts', (videoId) => service.generateSceneTranscripts(videoId));
  handle('video:delete', (videoId) => service.deleteVideo(videoId));
  handle('keyframe:replace', (payload) => service.replaceKeyframe(payload));
  handle('video:get-scenes', (videoId) => service.getScenes(videoId)); handle('videos:list', () => service.listVideos()); handle('clips:list', () => service.listClips()); handle('clip:get-detail', (clipId) => service.getClipDetail(clipId)); handle('notes:list', () => service.listNotes()); handle('notes:get-default-notebook', () => service.getDefaultNotebook()); handle('note:get-detail', (noteId) => service.getNoteDetail(noteId)); handle('note:delete', (noteId) => service.deleteNote(noteId)); handle('tasks:list', () => service.listTasks());
  handle('note-templates:list', () => service.listNoteTemplates());
  handle('note-templates:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入笔记模版',
      properties: ['openFile'],
      filters: [{ name: '笔记模版文件', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { template: await service.importNoteTemplate(result.filePaths[0]) };
  });
  handle('note-templates:export', async (template) => {
    const suggestedName = `${String(template?.name || '笔记模版').replace(/[\\/:*?"<>|]/g, '_')}.note-template.json`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出笔记模版',
      defaultPath: suggestedName,
      filters: [{ name: '笔记模版文件', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return service.exportNoteTemplate(template, result.filePath);
  });
  handle('tasks:retry', ({ taskId, mode }) => service.retryTask(taskId, mode)); handle('clip:generate', (payload) => service.generateClip(payload)); handle('clip:generate-preview', (payload) => service.generatePreviewClip(payload)); handle('clip:delete', (clipId) => service.deleteClip(clipId)); handle('notes:merge', (payload) => service.mergeNotes(payload));
  ipcMain.handle('template:print', async (event) => {
    assertSender(event);
    return new Promise((resolve) => {
      event.sender.print({ silent: false, printBackground: true }, (success, failureReason) => {
        resolve({ success, failureReason: failureReason || null });
      });
    });
  });
  handle('artifact:open', async ({ kind, id }) => { const filePath = service.artifactPath(kind, id); if (!filePath) throw new Error('文件不存在'); await shell.openPath(filePath); return { ok: true }; });
}
app.whenReady().then(async () => {
  // #region debug-point B:when-ready
  reportStartupDebug('B', 'electron app ready', { rendererUrl: rendererUrl || null, platform: process.platform });
  // #endregion
  const sampleVideoPath = process.env.TRAVEL_STUDY_SAMPLE_VIDEO || path.join(__dirname, '..', 'example', 'sample-study.mp4');
  const legacyDbPath = path.join(app.getPath('userData'), 'travel-study', 'travel-study.sqlite');
  const rootDir = resolveRootDir();
  process.env.TRAVEL_STUDY_CONFIG_DIR = path.join(rootDir, 'config');
  service = new AppService({ rootDir, sampleVideoPath, legacyDbPath, onTaskUpdate: (task) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send('task:update', task); } });
  // #region debug-point C:service-init
  reportStartupDebug('C', 'application service initialization started', { rootDir });
  // #endregion
  await service.init();
  // #region debug-point C:service-init-complete
  reportStartupDebug('C', 'application service initialization completed');
  // #endregion
  protocol.handle('media', async (request) => {
    const mediaPath = new URL(request.url).searchParams.get('path');
    if (!mediaPath) return new Response('Missing media path', { status: 400 });
    try {
      const stat = await fs.promises.stat(mediaPath);
      const total = stat.size;
      const extension = path.extname(mediaPath).toLowerCase();
      const contentType = extension === '.mp4' ? 'video/mp4' : extension === '.vtt' ? 'text/vtt; charset=utf-8' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.png' ? 'image/png' : 'application/octet-stream';
      const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': contentType, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' };
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': String(total) } });
      const range = request.headers.get('range');
      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        if (!match) return new Response('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
        const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2] || 0));
        const requestedEnd = match[2] ? Number(match[2]) : total - 1;
        const end = Math.min(total - 1, requestedEnd);
        if (start < 0 || start >= total || end < start) return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
        headers['Content-Length'] = String(end - start + 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
        return new Response(Readable.toWeb(fs.createReadStream(mediaPath, { start, end })), { status: 206, headers });
      }
      headers['Content-Length'] = String(total);
      return new Response(Readable.toWeb(fs.createReadStream(mediaPath)), { status: 200, headers });
    } catch { return new Response('Media not found', { status: 404 }); }
  });
  registerIpc(); session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false)); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => {
  // #region debug-point B:startup-error
  reportStartupDebug('B', 'startup failed', { name: error?.name, message: error?.message, stack: error?.stack });
  // #endregion
  console.error(error);
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
