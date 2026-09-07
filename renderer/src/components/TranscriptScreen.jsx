import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clapperboard, FileText, Lightbulb, LoaderCircle, Mic2, Play, RefreshCw, Save } from "lucide-react";
import { VideoPlayer } from "./WorkbenchScreen";
import { announce, FrameImage, localMediaUrl } from "./Shared";
import { PageFooter, PageHeader, WorkspacePage } from "./CorporateUI";

const frameUrl = (frame) => {
  const source = localMediaUrl(frame?.path);
  return source ? `${source}&v=${encodeURIComponent(frame?.timestamp_sec ?? 0)}` : "";
};

function SceneDetails({ scene, selectedFrames, selectedKeyframeId, onSelectKeyframe }) {
  return <aside className="transcript-scene-details">
    <div className="transcript-keyframes">{selectedFrames.map((frame, index) => <button type="button" key={frame.id || frame.path || index} className={frame.id === selectedKeyframeId ? "selected" : ""} onClick={() => onSelectKeyframe(frame.id)} aria-label={`选择${scene.title}关键帧 ${index + 1}`} aria-pressed={frame.id === selectedKeyframeId}><FrameImage index={index} src={frameUrl(frame)} alt="" /><span className="keyframe-selected-badge" aria-hidden="true"><Check size={13} /></span></button>)}</div>
    <div className="transcript-scene-meta">
      <section className="transcript-insight">
        <h2><FileText size={15} /> 场景概述</h2>
        <p>{scene.summary || "暂未生成场景概述。"}</p>
      </section>
      <section className="transcript-insight">
        <h2><Lightbulb size={15} /> 后续学习建议</h2>
        <p>{scene.study_advice || "结合场景内容，提出一个还想继续了解的问题。"}</p>
      </section>
    </div>
  </aside>;
}

function taskMetadata(task) {
  if (task?.metadata && typeof task.metadata === "object") return task.metadata;
  try { return JSON.parse(task?.metadata_json || "{}"); } catch { return {}; }
}

function AnalysisPanel({ video, analysisActions, analyzing, task }) {
  const canAnalyze = video?.status === "compressed" || video?.status === "ready";
  const metadata = taskMetadata(task);
  const failed = task?.status === "failed";
  const audioProgress = Number(metadata.audioProgress);
  const isTranscribing = task?.stage === "transcribe";
  const progress = isTranscribing && Number.isFinite(audioProgress) ? audioProgress : Math.round(Number(task?.progress || 0) * 100);
  const label = task?.stage === "frames"
    ? "正在提取关键帧"
    : task?.stage === "segment"
      ? "正在归纳场景"
      : isTranscribing && Number.isFinite(audioProgress)
        ? "正在识别语音"
        : "正在提取音频";
  return <aside className="transcript-scene-details transcript-analysis-panel">
    <div className="analysis-empty-state">
      <span className="analysis-panel-icon"><Clapperboard size={29} /></span>
      <h2>{analyzing ? "正在分析视频" : failed ? "视频分析未完成" : "尚未生成场景数据"}</h2>
      <p>{analyzing ? "正在提取音频、生成字幕并归纳场景，请保持当前页面。" : canAnalyze ? "使用AI分析并总结视频关键信息为研学笔记" : "请先返回素材管理完成视频压缩，压缩完成后即可在这里分析视频。"}</p>
      {analyzing ? <div className="analysis-progress"><div><span><LoaderCircle className="spin" size={17} /> {label}</span><b>{progress}%</b></div><i><em style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></i></div> : canAnalyze ? analysisActions : <span className="analysis-panel-status">等待视频压缩完成</span>}
      {failed && <div className="analysis-error-status" role="alert"><b>上次任务失败</b><span>{task.error || video?.error || "视频分析未完成，请检查模型配置后继续。"}</span></div>}
    </div>
  </aside>;
}

export default function TranscriptScreen({ scenes: sceneRows = [], selection, transcripts, setTranscripts, onBack, onNext, onReanalyze, onReplaceKeyframe, analyzing = false, analysisTask, video, resources = [] }) {
  const chosenScenes = sceneRows.filter((scene) => (selection[scene.id] || []).length > 0);
  const [activeSceneId, setActiveSceneId] = useState(null);
  const [playRequest, setPlayRequest] = useState(0);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState(null);
  const [frameMenu, setFrameMenu] = useState(null);
  const [sceneDataEntering, setSceneDataEntering] = useState(false);
  const [videoMagnetized, setVideoMagnetized] = useState(false);
  const [videoMagnetFrame, setVideoMagnetFrame] = useState(null);
  const hadScenes = useRef(false);
  const magnetizedRef = useRef(false);
  const pageHeaderRef = useRef(null);
  const previewShellRef = useRef(null);
  const previewWorkspaceRef = useRef(null);
  useEffect(() => {
    if (!frameMenu) return undefined;
    const closeFrameMenu = (event) => {
      if (event.target.closest(".frame-context-menu")) return;
      setFrameMenu(null);
    };
    window.addEventListener("pointerdown", closeFrameMenu);
    return () => window.removeEventListener("pointerdown", closeFrameMenu);
  }, [frameMenu]);
  useEffect(() => {
    if (!analysisMenuOpen) return undefined;
    const closeAnalysisMenu = (event) => {
      if (event.target.closest(".analysis-menu")) return;
      setAnalysisMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeAnalysisMenu);
    return () => window.removeEventListener("pointerdown", closeAnalysisMenu);
  }, [analysisMenuOpen]);
  useEffect(() => { if (!chosenScenes.some((scene) => scene.id === activeSceneId)) setActiveSceneId(chosenScenes[0]?.id || null); }, [activeSceneId, chosenScenes]);
  const activeScene = useMemo(() => chosenScenes.find((scene) => scene.id === activeSceneId) || chosenScenes[0], [activeSceneId, chosenScenes]);
  const activeFrames = (selection[activeScene?.id] || []).map((index) => activeScene?.keyframes?.[index]).filter(Boolean);
  useEffect(() => { if (!activeFrames.some((frame) => frame.id === selectedKeyframeId)) setSelectedKeyframeId(activeFrames[0]?.id || null); }, [activeScene?.id, selectedKeyframeId, activeFrames]);
  const videoPath = video?.proxy_path || video?.source_path;
  const videoSrc = localMediaUrl(videoPath);
  const playScene = (scene) => {
    setActiveSceneId(scene.id);
    setPlayRequest((request) => request + 1);
  };
  const replaceSelectedKeyframe = async () => {
    if (!frameMenu || !selectedKeyframeId) return;
    const replacement = { keyframeId: selectedKeyframeId, timestampSec: frameMenu.timestampSec, imageData: frameMenu.imageData };
    setFrameMenu(null);
    await onReplaceKeyframe?.(replacement);
  };
  const hasScenes = Boolean(activeScene);
  useEffect(() => {
    if (!hasScenes) {
      magnetizedRef.current = false;
      setVideoMagnetized(false);
      setVideoMagnetFrame(null);
      return undefined;
    }
    let animationFrame = 0;
    let releaseTimer = 0;
    const documentTop = (element) => {
      let top = 0;
      let current = element;
      while (current) {
        top += current.offsetTop;
        current = current.offsetParent;
      }
      return top;
    };
    const updateMagnet = () => {
      const shell = previewShellRef.current;
      const workspace = previewWorkspaceRef.current;
      if (!shell || !workspace) return;
      const headerHeight = pageHeaderRef.current?.getBoundingClientRect().height || 0;
      const workspaceTop = documentTop(shell);
      const threshold = Math.max(0, workspaceTop - Math.round(headerHeight / 2));
      if (!magnetizedRef.current && window.scrollY >= threshold) {
        const frame = workspace.getBoundingClientRect();
        magnetizedRef.current = true;
        setVideoMagnetFrame({ left: frame.left, width: frame.width, height: frame.height, entryTop: frame.top });
        setVideoMagnetized(true);
      } else if (magnetizedRef.current && window.scrollY < threshold) {
        magnetizedRef.current = false;
        setVideoMagnetized(false);
        setVideoMagnetFrame(null);
      } else if (magnetizedRef.current) {
        const frame = shell.getBoundingClientRect();
        setVideoMagnetFrame((current) => current && (current.left !== frame.left || current.width !== frame.width || current.height !== frame.height)
          ? { ...current, left: frame.left, width: frame.width, height: frame.height }
          : current);
      }
    };
    const requestUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateMagnet);
    };
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    releaseTimer = window.setTimeout(requestUpdate, 0);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(releaseTimer);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [hasScenes]);
  const canAnalyze = video?.status === "compressed" || video?.status === "ready";
  useLayoutEffect(() => {
    if (hasScenes && !hadScenes.current) {
      setSceneDataEntering(true);
      setAnalysisMenuOpen(false);
      const timer = window.setTimeout(() => setSceneDataEntering(false), 620);
      hadScenes.current = true;
      return () => window.clearTimeout(timer);
    }
    if (!hasScenes) hadScenes.current = false;
    return undefined;
  }, [hasScenes]);
  const canAnalyzeAudio = resources.includes("video.analyze.audio");
  const analysisActions = canAnalyzeAudio ? <div className="analysis-menu"><button className={hasScenes ? "secondary-button" : "primary-button"} onClick={() => setAnalysisMenuOpen((open) => !open)} aria-expanded={analysisMenuOpen} disabled={!canAnalyze || analyzing}><RefreshCw size={16} /> {hasScenes ? "重新分析视频" : "分析视频"} <ChevronRight size={15} className={analysisMenuOpen ? "analysis-menu-chevron open" : "analysis-menu-chevron"} /></button>{analysisMenuOpen && <div className="analysis-menu-popover"><button id="analyze-audio" onClick={() => { setAnalysisMenuOpen(false); onReanalyze("audio"); }}><b>AI 智能提取</b><span>按压缩视频大小和时长统计消耗，每10分钟消耗3积分</span></button><button id="analyze-vision" disabled><b>AI 深度提取 <em>未来开放</em></b><span>按压缩视频大小和时长统计消耗，每10分钟消耗30积分</span></button></div>}</div> : null;

  return (
    <WorkspacePage
      className={`transcript-page ${hasScenes ? "" : "transcript-page--empty"}`}
      header={<div ref={pageHeaderRef}><PageHeader eyebrow="VIDEO ANALYSIS" title="视频分析" description={hasScenes ? "查看视频分析生成的场景、关键帧与讲解内容，完成校订后进入关键帧选择。" : "使用音频或视频分析法生成场景、关键帧与讲解内容。"} actions={hasScenes ? analysisActions : null} /></div>}
      footer={<PageFooter start={<button className="secondary-button" onClick={onBack}><ChevronLeft size={17} /> 返回素材管理</button>} end={<><button className="secondary-button" disabled={!hasScenes} onClick={() => announce("文字草稿已保存到本地任务数据")}><Save size={16} /> 保存草稿</button><button className="primary-button" disabled={!hasScenes} onClick={() => { window.dispatchEvent(new CustomEvent("travel-study:pause-videos")); onNext(); }}>下一步：选择笔记样式 <ChevronRight size={17} /></button></>} />}
    >
      <div ref={previewShellRef} className={`video-analysis-player-shell ${videoMagnetized ? "is-magnetized" : ""}`} style={videoMagnetFrame ? { "--video-magnet-left": `${videoMagnetFrame.left}px`, "--video-magnet-width": `${videoMagnetFrame.width}px`, "--video-magnet-height": `${videoMagnetFrame.height}px`, "--video-magnet-entry": `${videoMagnetFrame.entryTop}px` } : undefined}>
        <section ref={previewWorkspaceRef} className={`transcript-preview-workspace ${hasScenes ? "has-scenes" : "no-scenes"} ${sceneDataEntering ? "scene-data-entering" : ""} ${videoMagnetized ? "is-magnetized" : ""}`}>
          {hasScenes ? <div className="transcript-video-panel"><VideoPlayer src={videoSrc} subtitlePath={video?.subtitle_path} startAt={Number(activeScene?.start_sec) || 0} autoPlay={playRequest > 0} playbackToken={playRequest} onFrameContext={(context) => selectedKeyframeId && setFrameMenu(context)} /></div> : <div className="transcript-video-panel empty-scene-video-panel"><VideoPlayer key={videoSrc} src={videoSrc} subtitlePath={video?.subtitle_path} /></div>}
          {hasScenes ? <SceneDetails scene={activeScene} selectedFrames={activeFrames} selectedKeyframeId={selectedKeyframeId} onSelectKeyframe={setSelectedKeyframeId} /> : <AnalysisPanel video={video} analysisActions={analysisActions} analyzing={analyzing} task={analysisTask} />}
        </section>
      </div>
      {hasScenes && <div className="transcript-layout">
        <section className="transcript-editor">
          {chosenScenes.map((scene) => (
            <article className={`transcript-section ${scene.id === activeScene?.id ? "active" : ""}`} key={scene.id}>
              <header>
                <span className="scene-chip">场景 {scene.index}</span>
                <button className="transcript-scene-title" onClick={() => setActiveSceneId(scene.id)}><b>{scene.title}</b><span>{scene.range} · 已选 {selection[scene.id].length} 张关键帧</span></button>
                <button className="text-button play-preview-button" onClick={() => playScene(scene)}><Play size={15} /> 播放场景</button>
              </header>
              <div className="transcript-body">
                <div className="selected-thumbs">{selection[scene.id].slice(0, 3).map((frame) => <FrameImage key={frame} index={frame} src={localMediaUrl(scene.keyframes?.[frame]?.path)} alt={`${scene.title}关键帧 ${frame + 1}`} />)}{selection[scene.id].length > 3 && <span>+{selection[scene.id].length - 3}</span>}</div>
                <label><span><Mic2 size={15} /> 语音转写</span><textarea value={transcripts[scene.id] ?? scene.transcript ?? scene.summary ?? ""} onChange={(event) => setTranscripts((current) => ({ ...current, [scene.id]: event.target.value }))} /></label>
              </div>
            </article>
          ))}
        </section>
      </div>}
      {frameMenu && <div className="frame-context-menu" style={{ left: frameMenu.x, top: frameMenu.y }} role="menu"><button type="button" onClick={replaceSelectedKeyframe}>截图替换选中的关键帧</button></div>}
    </WorkspacePage>
  );
}
