const native = typeof window !== 'undefined' ? window.electronAPI : null;
const demoResources = [
  { id: "menu.materials", name: "素材管理", resourceType: "menu", isAdminOnly: false },
  { id: "menu.profile", name: "个人信息", resourceType: "menu", isAdminOnly: false },
  { id: "menu.application", name: "应用配置", resourceType: "menu", isAdminOnly: true },
  { id: "menu.ai-config", name: "AI 模型配置", resourceType: "menu", isAdminOnly: true },
  { id: "menu.permissions", name: "权限管理", resourceType: "menu", isAdminOnly: true },
  { id: "video.analyze.audio", name: "音频场景分析", resourceType: "action", isAdminOnly: false },
  { id: "video.analyze.vision", name: "视频场景分析", resourceType: "action", isAdminOnly: false },
];
export const isElectron = Boolean(native?.isElectron);
export const appApi = native || {
  getSession: async () => null, login: async ({ username, password }) => {
    if (username === "超级奶妈" && password === "cjnmixx") return { user: { id: "10035", username, displayName: "超级奶妈", avatarPath: "", isSuperuser: false }, resources: ["menu.workbench", "menu.tour", "menu.materials", "menu.library", "menu.notes", "menu.planning", "menu.system-config", "menu.profile", "menu.credits", "video.analyze.audio", "video.analyze.vision", "action.credits.redeem", "action.profile.save"] };
    if (username === "admin" && password === "cjnbixx") return { user: { id: "10001", username, displayName: "admin", avatarPath: "", isSuperuser: true }, resources: ["menu.workbench", "menu.tour", "menu.materials", "menu.library", "menu.notes", "menu.planning", "menu.system-config", "menu.profile", "menu.application", "menu.ai-config", "menu.template-manager", "menu.permissions", "menu.credits", "video.analyze.audio", "video.analyze.vision", "action.credits.redeem", "action.profile.save", "action.config.save", "action.ai-config.save", "action.templates.manage", "action.permissions.manage"] };
    throw new Error("用户名或密码不正确");
  }, logout: async () => ({ ok: true }), getProfile: async () => ({ id: "10035", username: "超级奶妈", displayName: "超级奶妈", avatarPath: "", isSuperuser: false }), updateProfile: async (payload) => ({ id: "10035", username: payload?.username || "超级奶妈", displayName: payload?.displayName || "超级奶妈", avatarPath: "", isSuperuser: false }), pickProfileAvatar: async () => ({ canceled: true }), listPermissionUsers: async () => ({ users: [{ id: "10001", username: "admin", displayName: "admin", resources: demoResources.map((resource) => resource.id) }, { id: "10035", username: "超级奶妈", displayName: "超级奶妈", resources: demoResources.filter((resource) => !resource.isAdminOnly).map((resource) => resource.id) }], resources: demoResources }), updateUserPermissions: async (payload) => ({ userId: payload.userId, resources: payload.resourceIds || [] }),
  listTasks: async () => [], listVideos: async () => [], getOverviewStats: async () => ({ video_count: 0, ready_video_count: 0, scene_count: 0 }),
  compressVideo: async () => ({ demo: true }), openCompressedVideoFolder: async () => ({ ok: false, demo: true }), summarizeVideo: async () => ({ demo: true }), analyzeVideo: async () => ({ demo: true }), generateSceneTranscripts: async () => ({ demo: true }),
  checkPermission: async () => ({ available: true, cost: 0, balance: 500 }), getCreditSummary: async () => ({ account: { balance: 500, initialGranted: 500, updatedAt: "" }, recentRechargeRecords: [], recentConsumptionRecords: [] }), redeemCreditCode: async () => ({ ok: false, code: "CREDIT_CODE_INVALID", message: "兑换码无效，请核对后重试。" }), listCreditRechargeRecords: async () => ({ items: [] }), listCreditConsumptionRecords: async () => ({ items: [] }),
  deleteVideo: async () => ({ ok: true }), deleteClip: async () => ({ ok: true }), deleteNote: async () => ({ ok: true }), replaceKeyframe: async (payload) => payload,
  listClips: async () => [], getClipDetail: async () => null, getNoteDetail: async () => null, listNotes: async () => [], getDefaultNotebook: async () => ({ id: "notebook-default", name: "默认笔记本", note_count: 0, last_note_created_at: null }),
  useSampleVideo: async () => ({ demo: true }), pickVideo: async () => ({ canceled: true }), getScenes: async () => [], listNoteTemplates: async () => [], importNoteTemplate: async () => ({ canceled: true }), exportNoteTemplate: async () => ({ canceled: true }),
  generateClip: async () => ({ demo: true }), generatePreviewClip: async () => ({ demo: true }), mergeNotes: async () => ({ demo: true }), getModelConfig: async () => null, saveModelConfig: async () => ({ demo: true }), retryTask: async () => null, printTemplate: async () => ({ success: true }), onTaskUpdate: () => () => {}, openArtifact: async () => ({ ok: false }),
};
