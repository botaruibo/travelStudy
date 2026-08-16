const native = typeof window !== 'undefined' ? window.electronAPI : null;
export const isElectron = Boolean(native?.isElectron);
export const appApi = native || { listTasks: async () => [], listClips: async () => [], listNotes: async () => [], useSampleVideo: async () => ({ demo: true }), pickVideo: async () => ({ canceled: true }), getScenes: async () => [], generateClip: async () => ({ demo: true }), mergeNotes: async () => ({ demo: true }), retryTask: async () => null, onTaskUpdate: () => () => {}, openArtifact: async () => ({ ok: false }) };
