const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const { AppService } = require('./services/app-service.cjs');
let mainWindow; let service; const rendererUrl = process.env.ELECTRON_RENDERER_URL;
app.setName('游学纪');
if (process.platform === 'win32') app.setAppUserModelId('com.travelstudy.desktop');
function assertSender(event) { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('无效的渲染进程请求'); }
function createWindow() {
  mainWindow = new BrowserWindow({ title: '游学纪 · 交互 Demo', width: 1440, height: 920, minWidth: 1180, minHeight: 720, backgroundColor: '#F5F5F0', show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (rendererUrl) mainWindow.loadURL(rendererUrl); else mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}
function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => { assertSender(event); return fn(payload); });
  handle('app:get-context', () => ({ platform: process.platform, version: app.getVersion(), storageMode: 'local-first' }));
  handle('video:pick', async () => { const result = await dialog.showOpenDialog(mainWindow, { title: '导入研学视频', properties: ['openFile'], filters: [{ name: '视频', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv'] }] }); if (result.canceled || !result.filePaths[0]) return { canceled: true }; return service.addVideo({ sourcePath: result.filePaths[0], name: path.basename(result.filePaths[0]) }); });
  handle('video:use-sample', () => { const sourcePath = process.env.TRAVEL_STUDY_SAMPLE_VIDEO || 'E:\\DJI_20260803111824_0018_D.MP4'; if (!fs.existsSync(sourcePath)) throw new Error(`示例视频不存在：${sourcePath}`); return service.useSampleVideo(sourcePath); });
  handle('video:get-scenes', (videoId) => service.getScenes(videoId)); handle('videos:list', () => service.listVideos()); handle('clips:list', () => service.listClips()); handle('notes:list', () => service.listNotes()); handle('tasks:list', () => service.listTasks());
  handle('tasks:retry', ({ taskId, mode }) => service.retryTask(taskId, mode)); handle('clip:generate', (payload) => service.generateClip(payload)); handle('notes:merge', (payload) => service.mergeNotes(payload));
  handle('artifact:open', async ({ kind, id }) => { const filePath = service.artifactPath(kind, id); if (!filePath) throw new Error('文件不存在'); await shell.openPath(filePath); return { ok: true }; });
}
app.whenReady().then(async () => {
  service = new AppService({ rootDir: path.join(app.getPath('userData'), 'travel-study'), onTaskUpdate: (task) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send('task:update', task); } });
  await service.init(); registerIpc(); session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false)); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => { console.error(error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
