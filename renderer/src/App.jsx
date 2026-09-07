import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, FileText, ImagePlus, Merge } from "lucide-react";
import AppShell from "./components/AppShell";
import { Modal, ProcessingOverlay } from "./components/Shared";
import { appApi, isElectron } from "./api";
import { runProtectedAction } from "./protected-action";
import AuthScreen from "./components/AuthScreen";

const loadSelectionScreen = () => import("./components/SelectionScreen");
const DashboardScreen = lazy(() => import("./components/DashboardScreen"));
const PlanningScreen = lazy(() => import("./components/PlanningScreen"));
const WorkbenchScreen = lazy(() => import("./components/WorkbenchScreen"));
const SelectionScreen = lazy(loadSelectionScreen);
const TranscriptScreen = lazy(() => import("./components/TranscriptScreen"));
const TemplateScreen = lazy(() => import("./components/TemplateScreen"));
const LibraryScreen = lazy(() => import("./components/LibraryScreen"));
const NotesScreen = lazy(() => import("./components/NotesScreen"));
const ClipDetailScreen = lazy(() => import("./components/ClipDetailScreen"));
const SystemConfigScreen = lazy(() => import("./components/SystemConfigScreen"));
const SystemSettingsScreen = lazy(() => import("./components/SystemSettingsScreen"));
const BalanceManagementScreen = lazy(() => import("./components/BalanceManagementScreen"));
const ProfileScreen = lazy(() => import("./components/ProfileScreen"));
const PermissionManagementScreen = lazy(() => import("./components/PermissionManagementScreen"));

function normalizeNotice(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const message = input.trim();
    if (!message) return null;
    return {
      type: /(失败|错误|无法|超时|重试|无效|不存在|未能|请先|尚未|\berror\b|\bfailed?\b|\binvoking\b|\bexception\b|\bunknown\b)/i.test(message) ? "error" : "success",
      message,
    };
  }
  const message = String(input.message || "").trim();
  if (!message) return null;
  return {
    type: ["error", "warning"].includes(input.type) ? input.type : "success",
    message,
  };
}

function CompletionModal({ onClose, onLibrary }) { return <Modal title="临时笔记已生成" onClose={onClose}><div className="success-content"><span className="success-icon"><CheckCircle2 size={30} /></span><h3>临时笔记.pdf</h3><p>场景与关键帧已整理为 PDF，可在临时笔记中查看。</p><div className="file-summary"><FileText size={26} /><span><b>保存位置</b><small>本地素材库 / 输出文件</small></span></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>继续编辑</button><button className="primary-button" onClick={onLibrary}>查看临时笔记</button></div></div></Modal>; }
function MergeModal({ selectedClips, clipData, onClose, onComplete }) { const rows = clipData.filter((clip) => selectedClips.includes(clip.id)); const [cover, setCover] = useState("default"); return <Modal title="合并为研学笔记" onClose={onClose} wide><div className="merge-content"><section><span className="inspector-label">已选片段 · 可拖动排序</span>{rows.map((row, index) => <div className="merge-row" key={row.id}><span>{index + 1}</span><FileText size={18} /><div><b>{row.name}</b><small>{row.pages || row.page_count || 0} 页</small></div><span>⠿</span></div>)}</section><section className="cover-choice"><span className="inspector-label">笔记封面</span><button className={cover === "default" ? "active" : ""} onClick={() => setCover("default")}><div className="cover-preview" /><span><b>使用首个片段封面</b><small>系统默认</small></span>{cover === "default" && <CheckCircle2 size={18} />}</button><button className={cover === "upload" ? "active" : ""} onClick={() => setCover("upload")}><span className="upload-cover"><ImagePlus size={22} /></span><span><b>上传自定义照片</b><small>JPG 或 PNG</small></span>{cover === "upload" && <CheckCircle2 size={18} />}</button></section></div><footer className="modal-footer"><div><b>{rows.reduce((sum, row) => sum + (row.pages || row.page_count || 0), 0)} 页</b><span>将生成 1 个新 PDF</span></div><button className="primary-button" onClick={() => onComplete(cover)}><Merge size={17} /> 开始合并</button></footer></Modal>; }
function RedeemModal({ onClose }) { return <Modal title="积分兑换" onClose={onClose} className="redeem-modal"><div className="redeem-dialog"><img className="wechat-qr" src="/wechat-redeem-qr.jpg" alt="微信兑换码二维码" /><div className="redeem-dialog-copy"><p>可通过海鲜市场获取兑换码 <a href="https://m.tb.cn/h.8jfMyh1?tk=ajnlT289SFP" target="_blank" rel="noreferrer">入口</a></p><strong>也可以扫码加微信获取兑换码</strong></div></div></Modal>; }
function PageLoadingState() { return <div className="page-loading-state" role="status">正在加载页面…</div>; }

export default function App() {
  const [screen, setScreen] = useState("materials"); const [selection, setSelection] = useState({}); const [activeScene, setActiveScene] = useState(null); const [activeFrame, setActiveFrame] = useState({ sceneId: null, frameIndex: 0 }); const [view, setView] = useState("grid"); const [transcripts, setTranscripts] = useState({}); const [settings, setSettings] = useState({ template: "standard", accent: "green", layout: "double", showSummary: true, showImages: true, showAdvice: true }); const [processing, setProcessing] = useState(""); const [analyzingVideo, setAnalyzingVideo] = useState(false); const [completed, setCompleted] = useState(false); const [selectedClips, setSelectedClips] = useState([]); const [mergeOpen, setMergeOpen] = useState(false); const [videoId, setVideoId] = useState(null); const [selectedVideo, setSelectedVideo] = useState(null); const [videos, setVideos] = useState([]); const [sceneRows, setSceneRows] = useState([]); const [clipData, setClipData] = useState([]); const [clipDetail, setClipDetail] = useState(null); const [notes, setNotes] = useState([]); const [defaultNotebook, setDefaultNotebook] = useState(null); const [overviewStats, setOverviewStats] = useState({ video_count: 0, ready_video_count: 0, scene_count: 0 }); const [tasks, setTasks] = useState([]); const [notice, setNoticeState] = useState(null);
  const [session, setSession] = useState(null); const [authReady, setAuthReady] = useState(false); const [creditBalance, setCreditBalance] = useState(500); const [redeemOpen, setRedeemOpen] = useState(false);
  const completedClipTaskIds = useRef(new Set());
  const setNotice = useCallback((value) => setNoticeState(normalizeNotice(value)), []);
  useEffect(() => { if (!notice) return undefined; const timer = window.setTimeout(() => setNoticeState(null), 3500); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => { appApi.getSession().then(setSession).catch(() => setSession(null)).finally(() => setAuthReady(true)); }, []);
  const projectName = useMemo(() => screen === "system-config" ? "应用配置" : screen === "ai-config" ? "AI 模型配置" : screen === "balance-management" ? "积分管理" : screen === "template-manager" ? "笔记模版" : screen === "profile" ? "个人信息" : screen === "permissions" ? "权限管理" : screen === "transcript" ? "视频分析" : screen === "selection" ? "关键帧选择" : screen === "library" || screen === "notes" || screen === "clip-detail" || screen === "note-detail" ? "2026 中小学研学素材库" : screen === "materials" ? "本地学习素材库" : "研学笔记 · 学习材料管理", [screen]);
  const refresh = useCallback(async () => { if (!isElectron || !session) return []; const [nextVideos, nextClips, nextNotes, nextTasks, nextDefaultNotebook, nextOverviewStats, creditSummary] = await Promise.all([appApi.listVideos(), appApi.listClips(), appApi.listNotes(), appApi.listTasks(), appApi.getDefaultNotebook(), appApi.getOverviewStats(), appApi.getCreditSummary()]);
    setVideos(nextVideos); setClipData(nextClips); setNotes(nextNotes); setTasks(nextTasks); setDefaultNotebook(nextDefaultNotebook); setOverviewStats(nextOverviewStats); setCreditBalance(Number(creditSummary?.account?.balance || 0)); setSelectedVideo((current) => nextVideos.find((video) => video.id === current?.id) || nextVideos.find((video) => video.is_sample) || nextVideos[0] || null); return nextVideos; }, [session]);
  const showCompletedClip = useCallback(async (taskId) => {
    if (completedClipTaskIds.current.has(taskId)) return;
    completedClipTaskIds.current.add(taskId);
    await refresh();
    setScreen("library");
    setNotice("临时笔记 PDF 已生成，已跳转到临时笔记");
  }, [refresh]);
  const watchClipTask = useCallback(async (taskId) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 500));
      const nextTasks = await appApi.listTasks();
      setTasks(nextTasks);
      const task = nextTasks.find((item) => item.id === taskId);
      if (task?.status === "succeeded") { await showCompletedClip(taskId); return; }
      if (task?.status === "failed") { setNotice(task.error || "临时笔记生成失败，请重试"); return; }
    }
  }, [showCompletedClip]);
  const loadScenesForTranscript = async (targetVideoId) => {
    const rows = await appApi.getScenes(targetVideoId);
    if (!rows.length) throw new Error("视频分析未生成场景");
    const normalized = rows.map((row, index) => ({
      ...row,
      index: index + 1,
      frameCount: row.keyframes?.length || 0,
      range: `${Math.floor(row.start_sec / 60).toString().padStart(2, "0")}:${Math.floor(row.start_sec % 60).toString().padStart(2, "0")} – ${Math.floor(row.end_sec / 60).toString().padStart(2, "0")}:${Math.floor(row.end_sec % 60).toString().padStart(2, "0")}`,
      defaultSelected: Array.from({ length: row.keyframes?.length || 0 }, (_, frameIndex) => frameIndex),
    }));
    setVideoId(targetVideoId);
    setSceneRows(normalized);
    setSelection(Object.fromEntries(normalized.map((row) => [row.id, row.defaultSelected])));
    setTranscripts(Object.fromEntries(normalized.map((row) => [row.id, row.transcript || ""])));
    setActiveScene(normalized[0]?.id || null);
    setActiveFrame({ sceneId: normalized[0]?.id || null, frameIndex: normalized[0]?.defaultSelected?.[0] ?? 0 });
  };
  const reanalyzeVideo = async (method = "audio") => {
    if (!videoId) { setNotice("请先选择一个视频"); return; }
    const label = method === "vision" ? "正在使用视频模型重新分析…" : "正在使用音频分析法重新分析…";
    if (!isElectron) { timedTransition(label, "transcript", 900); return; }
    try {
      const actionId = method === "vision" ? "video.analyze.vision" : "video.analyze.audio";
      const buttonId = method === "vision" ? "analyze-vision" : "analyze-audio";
      let task;
      const allowed = await runProtectedAction({
        actionId,
        buttonId,
        context: { videoId },
        announce: setNotice,
        onAllowed: async () => {
          task = await appApi.summarizeVideo(videoId, method, crypto.randomUUID());
          if (!task?.id) throw new Error(task?.message || "未能创建视频分析任务");
        },
      });
      if (!allowed) return;
      if (!task?.id) throw new Error("未能创建视频分析任务");
      setAnalyzingVideo(true);
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 500));
        const nextTasks = await appApi.listTasks();
        setTasks(nextTasks);
        const current = nextTasks.find((item) => item.id === task.id);
        if (current?.status === "succeeded") {
          await loadScenesForTranscript(videoId);
          setAnalyzingVideo(false);
          setScreen("transcript");
          return;
        }
        if (current?.status === "failed") throw new Error(current.error || "视频重新分析失败");
      }
      throw new Error("视频重新分析超时，请在任务列表中查看状态");
    } catch (error) {
      setAnalyzingVideo(false);
      setNotice(error.message || "视频重新分析失败");
    }
  };
  const openVideoSummary = async (targetVideoId) => {
    const rows = await appApi.getScenes(targetVideoId);
    if (!rows.length) {
      setVideoId(targetVideoId);
      setSceneRows([]);
      setSelection({});
      setTranscripts({});
      setActiveScene(null);
      setActiveFrame({ sceneId: null, frameIndex: 0 });
      setScreen("transcript");
      return;
    }
    const normalized = rows.map((row, index) => ({ ...row, index: index + 1, frameCount: row.keyframes?.length || 0, range: `${Math.floor(row.start_sec / 60).toString().padStart(2, "0")}:${Math.floor(row.start_sec % 60).toString().padStart(2, "0")} – ${Math.floor(row.end_sec / 60).toString().padStart(2, "0")}:${Math.floor(row.end_sec % 60).toString().padStart(2, "0")}`, defaultSelected: Array.from({ length: row.keyframes?.length || 0 }, (_, i) => i) }));
    setVideoId(targetVideoId); setSceneRows(normalized); setSelection(Object.fromEntries(normalized.map((row) => [row.id, row.defaultSelected]))); setTranscripts(Object.fromEntries(normalized.map((row) => [row.id, row.transcript || row.summary || ""]))); setActiveScene(normalized[0]?.id); setActiveFrame({ sceneId: normalized[0]?.id, frameIndex: normalized[0]?.defaultSelected?.[0] ?? 0 }); setScreen("transcript");
  };
  const navigate = (target) => {
    if (target !== "selection") { setScreen(target); return; }
    const targetVideo = selectedVideo || videos.find((video) => video.is_sample) || videos[0];
    if (!targetVideo) { setNotice("当前没有可用于预览的视频"); return; }
    void openVideoSummary(targetVideo.id);
  };
  useEffect(() => { if (!session) return undefined; const onNotice = (event) => setNotice(event.detail || "操作已记录"); window.addEventListener("travel-study:notice", onNotice); void refresh(); const off = appApi.onTaskUpdate?.((task) => { setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]); if (task.kind === "video-analysis" || task.kind === "video-compress") void refresh(); if (task.status === "succeeded" && task.kind === "clip-pdf") void showCompletedClip(task.id); if (task.status === "succeeded" && task.kind === "note-merge") void refresh(); if (task.status === "failed") setNotice({ type: "error", message: task.error || "视频任务失败" }); }); return () => { window.removeEventListener("travel-study:notice", onNotice); off?.(); }; }, [session, refresh, showCompletedClip, setNotice]);
  useEffect(() => { if (screen === "library" || screen === "notes") void refresh(); }, [screen, refresh]);
  const timedTransition = (label, target, delay = 900) => { setProcessing(label); window.setTimeout(() => { setProcessing(""); setScreen(target); }, delay); };
  const toggleScene = (sceneId) => { const scene = sceneRows.find((item) => item.id === sceneId); if (!scene) return; setSelection((current) => ({ ...current, [sceneId]: current[sceneId].length === scene.frameCount ? [] : Array.from({ length: scene.frameCount }, (_, index) => index) })); };
  const toggleFrame = (sceneId, frame) => setSelection((current) => ({ ...current, [sceneId]: current[sceneId].includes(frame) ? current[sceneId].filter((item) => item !== frame) : [...current[sceneId], frame].sort((a, b) => a - b) }));
  const selectScene = (sceneId) => { const scene = sceneRows.find((item) => item.id === sceneId); setActiveScene(sceneId); setActiveFrame({ sceneId, frameIndex: selection[sceneId]?.[0] ?? (scene?.frameCount ? 0 : 0) }); };
  const previewFrame = (sceneId, frameIndex) => { setActiveScene(sceneId); setActiveFrame({ sceneId, frameIndex }); };
  const replaceKeyframe = async (payload) => {
    try {
      const updated = await appApi.replaceKeyframe(payload);
      if (!updated?.id) throw new Error("关键帧替换失败");
      setSceneRows((current) => current.map((scene) => ({
        ...scene,
        keyframes: (scene.keyframes || []).map((frame) => frame.id === updated.id ? { ...frame, ...updated } : frame),
      })));
      setNotice("已使用当前视频画面替换关键帧");
    } catch (error) {
      setNotice(error.message || "关键帧替换失败");
    }
  };
  const startVideo = async (mode, existingVideo) => { if (mode === "select") { setSelectedVideo(existingVideo); return; } if (!isElectron) { void loadSelectionScreen(); timedTransition("正在压缩视频并识别关键场景…", "selection", 1200); return; } try { const result = mode === "sample" ? await appApi.useSampleVideo() : await appApi.pickVideo(); if (result?.video) { setVideoId(result.video.id); const nextVideos = await refresh(); setSelectedVideo(nextVideos.find((video) => video.id === result.video.id) || result.video); setNotice("视频已加入本地素材库，请点击“视频压缩”开始处理"); } } catch (error) { setNotice(error.message); } };
  const compressVideo = async (video) => { if (!isElectron) return timedTransition("正在压缩视频…", "materials", 1200); try { setSelectedVideo(video); setVideoId(video.id); await appApi.compressVideo(video.id); setNotice("视频压缩进行中，进度会显示在预览和文件列表中"); await refresh(); } catch (error) { setNotice(error.message); } };
  const pauseVideos = () => window.dispatchEvent(new CustomEvent("travel-study:pause-videos"));
  const openScenePreview = async (video) => { if (!video) return; pauseVideos(); setSelectedVideo(video); setVideoId(video.id); await openVideoSummary(video.id); };
  const deleteVideo = async (video) => { if (!isElectron) return; if (!window.confirm(`确定从本地视频列表移除“${video.name}”吗？\n仅删除视频记录，关联临时笔记、研学笔记、分析结果和生成文件都会保留。`)) return; try { const result = await appApi.deleteVideo(video.id); if (!result?.ok) throw new Error(result?.reason || "删除失败"); if (selectedVideo?.id === video.id) setSelectedVideo(null); await refresh(); setNotice("视频记录已从本地视频列表移除"); } catch (error) { setNotice(error.message || "删除视频记录失败"); } };
  const generate = async () => { if (isElectron) { try { const task = videoId ? await appApi.generateClip({ videoId, selections: selection, settings, transcripts }) : await appApi.generatePreviewClip({ selections: selection, settings, transcripts }); if (!task?.id) throw new Error("未能创建临时笔记生成任务"); void watchClipTask(task.id); setNotice("正在生成临时笔记 PDF，完成后将自动跳转"); } catch (error) { setNotice(error.message || "临时笔记生成失败，请重试"); } return; } setProcessing("正在渲染 H5 页面并生成 PDF…"); window.setTimeout(() => { setProcessing(""); setScreen("library"); setNotice("临时笔记 PDF 已生成，已跳转到临时笔记"); }, 1100); };
  const viewClip = async (clip) => { try { if (isElectron) { const detail = await appApi.getClipDetail(clip.id); setClipDetail(detail); } else { const pages = sceneRows.filter((scene) => selection[scene.id]?.length).map((scene) => ({ ...scene, keyframes: [] })); setClipDetail({ clip, settings, pages }); } setScreen("clip-detail"); } catch (error) { setNotice(error.message || "无法打开临时笔记详情"); } };
  const deleteClip = async (clip) => { if (!isElectron) return; if (!window.confirm(`确定删除“${clip.name}”吗？\n将删除本地 PDF 文件，并将该片段标记为已删除；已生成的研学笔记不会受影响。`)) return; try { const result = await appApi.deleteClip(clip.id); if (!result?.ok) throw new Error(result?.reason || "删除失败"); setSelectedClips((current) => current.filter((id) => id !== clip.id)); await refresh(); setNotice("临时笔记已删除"); } catch (error) { setNotice(error.message); } };
  const viewNote = async (note) => { try { if (isElectron) setNoteDetail(await appApi.getNoteDetail(note.id)); else { const pages = sceneRows.filter((scene) => selection[scene.id]?.length).map((scene) => ({ ...scene, transcript: scene.summary, keyframes: [] })); setNoteDetail({ note: { ...note, exists: false }, settings, pages }); } setScreen("note-detail"); } catch (error) { setNotice(error.message || "无法打开研学笔记详情"); } };
  const deleteNote = async (note) => { if (!window.confirm(`确定删除“${note.name}”吗？\n该操作会删除本地 PDF 文件，并从研学笔记列表中移除该记录。`)) return; try { const result = await appApi.deleteNote(note.id); if (!result?.ok) throw new Error(result?.reason || "删除失败"); await refresh(); setNotice("研学笔记已删除"); } catch (error) { setNotice(error.message || "删除研学笔记失败"); } };
  const renderActivePage = () => {
    switch (screen) {
      case "workbench": return <DashboardScreen videos={videos} clips={clipData} notes={notes} tasks={tasks} onPlan={() => setScreen("planning")} onMaterials={() => setScreen("materials")} />;
      case "planning": return <PlanningScreen onBack={() => setScreen("workbench")} />;
      case "system-config": return <SystemSettingsScreen />;
      case "ai-config": return <SystemConfigScreen onNotice={setNotice} />;
      case "balance-management": return <BalanceManagementScreen onNotice={setNotice} />;
      case "profile": return <ProfileScreen user={session.user} onUserChange={(user) => setSession((current) => ({ ...current, user }))} onNotice={setNotice} />;
      case "permissions": return <PermissionManagementScreen onNotice={setNotice} />;
      case "selection": return <SelectionScreen scenes={sceneRows} selection={selection} activeScene={activeScene} activeFrame={activeFrame} setActiveScene={selectScene} onPreviewFrame={previewFrame} onToggleScene={toggleScene} onToggleFrame={toggleFrame} view={view} setView={setView} onNext={() => setScreen("transcript")} onBack={() => setScreen("materials")} video={selectedVideo} />;
      case "transcript": return <TranscriptScreen scenes={sceneRows} selection={selection} transcripts={transcripts} setTranscripts={setTranscripts} onBack={() => setScreen("materials")} onNext={() => setScreen("template")} onReanalyze={reanalyzeVideo} onReplaceKeyframe={replaceKeyframe} analyzing={analyzingVideo} analysisTask={tasks.find((task) => task.entity_id === videoId && task.kind === "video-analysis" && ["queued", "running", "failed"].includes(task.status))} video={selectedVideo} resources={session.resources} />;
      case "template": return <TemplateScreen settings={settings} setSettings={setSettings} scenes={sceneRows} selection={selection} transcripts={transcripts} onBack={() => { pauseVideos(); setScreen("transcript"); }} onGenerate={generate} standalone={false} />;
      case "template-manager": return <TemplateScreen settings={settings} setSettings={setSettings} standalone={true} />;
      case "library": return <LibraryScreen clips={clipData} selectedClips={selectedClips} setSelectedClips={setSelectedClips} onMerge={() => setMergeOpen(true)} onOpen={(id) => appApi.openArtifact("clip", id)} onView={viewClip} onDelete={deleteClip} />;
      case "clip-detail": return <ClipDetailScreen detail={clipDetail} onBack={() => setScreen("library")} onOpenPdf={(id) => appApi.openArtifact("clip", id)} />;
      case "notes": return <NotesScreen notes={notes} notebook={defaultNotebook} onView={viewNote} onDelete={deleteNote} />;
      case "note-detail": return <ClipDetailScreen detail={noteDetail} onBack={() => setScreen("notes")} onOpenPdf={(id) => appApi.openArtifact("note", id)} />;
      case "materials":
      default: return <WorkbenchScreen processing={Boolean(processing)} onPrefetch={loadSelectionScreen} onStart={startVideo} onCompress={compressVideo} onScenePreview={openScenePreview} onDelete={deleteVideo} onOpenCompressedFolder={async () => { try { await appApi.openCompressedVideoFolder(); } catch (error) { setNotice(error.message || "无法打开压缩视频文件夹"); } }} videos={videos} tasks={tasks} selectedVideo={selectedVideo} stats={overviewStats} />;
    }
  };
  const handleAuthenticated = (nextSession) => { setSession(nextSession); setScreen("materials"); };
  const handleLogout = async () => { try { await appApi.logout(); } finally { setSession(null); setRedeemOpen(false); setScreen("materials"); } };
  if (!authReady) return <ProcessingOverlay label="正在准备本地登录…" />;
  if (!session) return <AuthScreen onAuthenticated={handleAuthenticated} />;
  return <AppShell active={screen} onNavigate={navigate} projectName={projectName} resources={session.resources} user={session.user} creditBalance={creditBalance} onRedeem={() => setRedeemOpen(true)} onLogout={handleLogout}><Suspense fallback={processing ? null : <PageLoadingState />}><div className="app-page-outlet" data-screen={screen}>{renderActivePage()}</div></Suspense>{processing && <ProcessingOverlay label={processing} />}{redeemOpen && <RedeemModal onClose={() => setRedeemOpen(false)} />}{completed && <CompletionModal onClose={() => setCompleted(false)} onLibrary={() => { setCompleted(false); setScreen("library"); }} />}{mergeOpen && <MergeModal selectedClips={selectedClips} clipData={clipData} onClose={() => setMergeOpen(false)} onComplete={async (cover) => { setMergeOpen(false); if (isElectron) { await appApi.mergeNotes({ clipIds: selectedClips, cover }); setSelectedClips([]); setNotice("已提交研学笔记合并任务"); } else timedTransition("正在合并片段并生成封面…", "notes", 1000); }} />}{notice && <button className={`app-notice ${notice.type}`} onClick={() => setNoticeState(null)}>{notice.type === "error" ? <AlertCircle size={18} aria-hidden="true" /> : notice.type === "warning" ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}<span>{notice.message}</span></button>}</AppShell>;
}
