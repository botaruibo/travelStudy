import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Copy, FileVideo, FolderOpen, Play, LoaderCircle, Pause, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { MetricStrip, PageHeader, WorkspacePage } from "./CorporateUI";

const formatSize = (bytes = 0) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatDuration = (seconds = 0) => Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}` : "00:00";
const compactSourcePath = (value) => {
  const sourcePath = String(value || "");
  const parts = sourcePath.split(/[\\/]+/).filter(Boolean);
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : sourcePath;
};
const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export function VideoPlayer({ src, subtitlePath, progressLabel, progressValue = 0, startAt, autoPlay = false, playbackToken = 0, onFrameContext }) {
  const ref = useRef(null);
  const thumbRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [thumbs, setThumbs] = useState([]);
  const setVideoDuration = (value) => { if (Number.isFinite(value) && value > 0) setDuration(value); };
  const seekTo = (value) => { const target = Math.max(0, Math.min(duration, value)); setProgress(target); if (ref.current) ref.current.currentTime = target; };
  const seek = (amount) => seekTo((ref.current?.currentTime || progress) + amount);
  const toggle = async () => { if (!ref.current) return; if (ref.current.paused) { try { await ref.current.play(); } catch { setPlaying(false); } } else ref.current.pause(); };
  const waitForFrame = (video, target) => new Promise((resolve) => { if (Math.abs(video.currentTime - target) < .02 && video.readyState >= 2) { resolve(); return; } const done = () => { video.removeEventListener("seeked", done); resolve(); }; video.addEventListener("seeked", done, { once: true }); video.currentTime = target; });
  const buildThumbs = async (durationValue) => { const video = thumbRef.current; if (!video || !Number.isFinite(durationValue) || durationValue <= 0) return; const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 68; const values = []; try { for (let index = 0; index < 8; index += 1) { await waitForFrame(video, durationValue * index / 8); const context = canvas.getContext("2d"); context.drawImage(video, 0, 0, canvas.width, canvas.height); values.push(canvas.toDataURL("image/jpeg", .55)); } setThumbs(values); } catch { setThumbs([]); } };
  const startSeek = () => setIsSeeking(true);
  const updateSeek = (event) => setProgress(Number(event.currentTarget.value));
  const commitSeek = (event) => { seekTo(Number(event.currentTarget.value)); setIsSeeking(false); };
  const showSubtitles = () => {
    const track = ref.current?.textTracks?.[0];
    if (track) track.mode = "showing";
  };
  useEffect(() => {
    const pause = () => ref.current?.pause();
    window.addEventListener("travel-study:pause-videos", pause);
    return () => window.removeEventListener("travel-study:pause-videos", pause);
  }, []);
  const captureCurrentFrame = (video) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .92);
  };
  const openFrameContext = (event) => {
    const video = event.currentTarget;
    if (!onFrameContext || !video.paused || !video.videoWidth || !video.videoHeight) return;
    event.preventDefault();
    onFrameContext({ imageData: captureCurrentFrame(video), timestampSec: video.currentTime, x: event.clientX, y: event.clientY });
  };
  useEffect(() => {
    if (!ref.current || !Number.isFinite(Number(startAt))) return;
    const startPlayback = async () => {
      ref.current.currentTime = Math.max(0, Number(startAt));
      setProgress(ref.current.currentTime);
      if (autoPlay) {
        try { await ref.current.play(); } catch { setPlaying(false); }
      }
    };
    if (ref.current.readyState >= 1) void startPlayback();
    else ref.current.addEventListener("loadedmetadata", startPlayback, { once: true });
    return () => ref.current?.removeEventListener("loadedmetadata", startPlayback);
  }, [startAt, autoPlay, playbackToken]);
  const subtitleSrc = subtitlePath ? `media://local?path=${encodeURIComponent(subtitlePath)}` : "";
  return <div className="video-player"><video ref={ref} src={src} className="selected-video" preload="auto" playsInline crossOrigin="anonymous" onContextMenu={openFrameContext} onLoadedMetadata={(event) => { setVideoDuration(event.currentTarget.duration); showSubtitles(); }} onDurationChange={(event) => setVideoDuration(event.currentTarget.duration)} onCanPlay={(event) => { setVideoDuration(event.currentTarget.duration); showSubtitles(); }} onTimeUpdate={(event) => { if (!isSeeking) setProgress(event.currentTarget.currentTime); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>{subtitleSrc && <track key={subtitleSrc} kind="subtitles" srcLang="zh-CN" label="中文" src={subtitleSrc} default onLoad={showSubtitles} />}</video><video ref={thumbRef} src={src} className="thumbnail-source" preload="auto" muted crossOrigin="anonymous" aria-hidden="true" onLoadedData={(event) => buildThumbs(event.currentTarget.duration)} />{progressLabel && <div className="compression-progress"><div><span>{progressLabel}</span><b>{progressValue}%</b></div><div className="progress-track"><i style={{ width: `${progressValue}%` }} /></div></div>}<div className="video-index-strip">{thumbs.map((thumb, index) => <button key={`${index}-${thumb.slice(-12)}`} onClick={() => seekTo(duration * index / thumbs.length)}><img src={thumb} alt={`视频进度 ${index + 1}`} /></button>)}</div><div className="video-controls"><button onClick={() => seek(-10)} aria-label="后退十秒"><SkipBack size={16} /></button><button className="video-play-button" onClick={toggle} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button><button onClick={() => seek(10)} aria-label="前进十秒"><SkipForward size={16} /></button><input aria-label="视频进度" type="range" min="0" max={duration || 0} step="0.1" value={progress} onPointerDown={startSeek} onInput={updateSeek} onPointerUp={commitSeek} onKeyUp={commitSeek} /><span>{formatDuration(progress)} / {formatDuration(duration)}</span></div></div>;
}

export default function WorkbenchScreen({ onStart, onCompress, onScenePreview, onDelete, onOpenCompressedFolder, onPrefetch, processing, videos = [], tasks = [], selectedVideo, stats = {} }) {
  const selected = selectedVideo || videos[0];
  const activeTask = selected && tasks.find((task) => task.entity_id === selected.id && ["video-compress", "video-analysis"].includes(task.kind) && ["queued", "running"].includes(task.status));
  const taskProgress = activeTask ? Math.round((activeTask.progress || 0) * 100) : 0;
  const taskLabel = activeTask ? (activeTask.kind === "video-compress" ? "正在压缩视频" : "正在分析场景内容") : "";
  const mediaPath = selected?.proxy_path || selected?.source_path;
  const previewSrc = mediaPath ? `media://local?path=${encodeURIComponent(mediaPath)}` : "/botanical-hero.webp";
  const previewMeta = useMemo(() => selected ? `${formatSize(selected.source_size)} · ${formatDuration(selected.duration)}` : "示例视频 · 21:36", [selected]);
  const statusLabel = (video, isCompressing) => isCompressing ? "压缩中" : video.status === "ready" ? "已分析" : video.status === "compressed" ? "已压缩" : video.status === "failed" ? "失败" : "待压缩";

  return <WorkspacePage
    className="workbench-page"
    header={<PageHeader
      eyebrow="VIDEO TO FIELD NOTE"
      title="素材管理"
      description="导入游学视频，完成压缩与场景分析，并将关键内容整理为可复用的学习材料。"
      metrics={<MetricStrip label="素材概况" items={[
        { id: "videos", icon: FileVideo, value: stats.video_count ?? videos.length, label: "已导入视频" },
        { id: "ready", icon: Clapperboard, value: stats.ready_video_count ?? videos.filter((video) => video.status === "ready").length, label: "已完成分析", tone: "success" },
        { id: "scenes", icon: Play, value: stats.scene_count ?? 0, label: "已整理场景", tone: "warning" },
      ]} />}
    />}
  >
    <section className="import-stage">
      <div className="import-copy"><span className="import-icon"><FileVideo size={28} /></span><h2>导入一段游学视频</h2><p>支持 MP4、MOV、M4V，单文件不超过 8GB。视频和分析结果默认仅保存在本机。</p><div className="import-actions"><button className="primary-button" onClick={() => onStart("local")} onMouseEnter={onPrefetch} onFocus={onPrefetch} disabled={processing}><FolderOpen size={17} /> 选择本地文件</button></div></div>
      <div className="import-preview">{mediaPath ? <VideoPlayer key={previewSrc} src={previewSrc} subtitlePath={selected?.subtitle_path} progressLabel={taskLabel} progressValue={taskProgress} /> : <img src="/botanical-hero.webp" alt="植物园游学活动预览" fetchPriority="high" decoding="async" />}<div className="video-badge">{selected ? "已选视频" : "示例 · 上海植物园"}</div><div className="preview-meta"><span>{selected?.name || "植物园游学_上午.mp4"}<small>{previewMeta}{selected?.proxy_size ? ` · 压缩后 ${formatSize(selected.proxy_size)}` : ""}</small></span><b>{formatDuration(selected?.duration) === "00:00" ? "待分析" : formatDuration(selected?.duration)}</b></div></div>
    </section>
    <section className="video-library">
      <header><div><h2>本地视频</h2><p>压缩后的视频会保存在本地素材库，可进入视频分析页发起分析和挑选场景。</p></div><div className="video-library-header-actions"><button type="button" className="inline-link-button" onClick={onOpenCompressedFolder}><FolderOpen size={16} /> 打开压缩视频文件夹</button><span>{videos.length} 个文件</span></div></header>
      {videos.length === 0 && <div className="empty-video-list">导入视频后，文件会出现在这里</div>}
      {videos.map((video) => {
        const compressionTask = tasks.find((item) => item.entity_id === video.id && item.kind === "video-compress" && ["queued", "running"].includes(item.status));
        const summaryTask = tasks.find((item) => item.entity_id === video.id && item.kind === "video-analysis" && ["queued", "running"].includes(item.status));
        const activeRowTask = compressionTask || summaryTask;
        const progress = activeRowTask ? Math.round((activeRowTask.progress || 0) * 100) : 0;
        const isCompressed = video.status === "compressed" || video.status === "ready";
        const busy = Boolean(activeRowTask);
        const status = statusLabel(video, Boolean(compressionTask));
        const statusClass = compressionTask ? "compressing" : video.status;

        return <div className={`video-row ${selected?.id === video.id ? "selected" : ""}`} key={video.id} onClick={() => onStart("select", video)}>
          <div className="video-thumb"><Play size={18} /></div>
          <div className="video-info">
            <button type="button" className="list-title-link" onClick={(event) => { event.stopPropagation(); onStart("select", video); }}>{video.name}</button>
            <span>原文件 {formatSize(video.source_size)} · 压缩后 {video.proxy_size ? formatSize(video.proxy_size) : "待生成"} · {formatDuration(video.duration)}</span>
            {video.source_path && <div className="video-source-path" title={video.source_path}>
              <FolderOpen size={13} aria-hidden="true" />
              <span>{compactSourcePath(video.source_path)}</span>
              <button
                type="button"
                className="copy-source-path-button"
                aria-label={`复制 ${video.name} 的原文件路径`}
                title="复制原文件路径"
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    await copyText(video.source_path);
                    window.dispatchEvent(new CustomEvent("travel-study:notice", { detail: "已复制原文件路径" }));
                  } catch {
                    window.dispatchEvent(new CustomEvent("travel-study:notice", { detail: "复制原文件路径失败" }));
                  }
                }}
              >
                <Copy size={14} aria-hidden="true" />
              </button>
            </div>}
          </div>
          {activeRowTask && <div className="row-progress"><LoaderCircle size={16} className="spin" /><span>{compressionTask ? `压缩中 ${progress}%` : `分析中 ${progress}%`}</span></div>}
          {!compressionTask && <span className={`video-status ${statusClass}`}>{status}</span>}
          <div className="video-actions">
            <button className={`secondary-button summary-button ${isCompressed ? "compressed-button" : ""}`} disabled={isCompressed || busy} onClick={(event) => { event.stopPropagation(); onCompress(video); }}>视频压缩</button>
            <button className="primary-button summary-button" disabled={!isCompressed} onClick={(event) => { event.stopPropagation(); onScenePreview(video); }}><Clapperboard size={15} /> 视频分析</button>
            <button type="button" className="danger-icon-button list-delete-button" aria-label={`删除 ${video.name}`} title="删除视频" onClick={(event) => { event.stopPropagation(); onDelete(video); }}><Trash2 size={18} /></button>
          </div>
        </div>;
      })}
    </section>
  </WorkspacePage>;
}
