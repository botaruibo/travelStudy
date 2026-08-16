const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform, isElectron: true,
  getContext: () => invoke('app:get-context'), pickVideo: () => invoke('video:pick'), useSampleVideo: () => invoke('video:use-sample'),
  getScenes: (videoId) => invoke('video:get-scenes', videoId), listVideos: () => invoke('videos:list'), listClips: () => invoke('clips:list'), listNotes: () => invoke('notes:list'), listTasks: () => invoke('tasks:list'),
  retryTask: (taskId, mode) => invoke('tasks:retry', { taskId, mode }), generateClip: (payload) => invoke('clip:generate', payload), mergeNotes: (payload) => invoke('notes:merge', payload), openArtifact: (kind, id) => invoke('artifact:open', { kind, id }),
  onTaskUpdate: (callback) => { const listener = (_event, task) => callback(task); ipcRenderer.on('task:update', listener); return () => ipcRenderer.removeListener('task:update', listener); }
});
