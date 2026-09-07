import React from "react";
import {
  Clapperboard,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid2X2,
  List,
  Play,
  Rows3,
  SlidersHorizontal,
} from "lucide-react";
import { announce, FrameImage, localMediaUrl } from "./Shared";
import { PageFooter, PageHeader, WorkspacePage } from "./CorporateUI";

function SceneCheckbox({ state }) {
  return <span className={`scene-checkbox ${state}`} aria-hidden="true">{state === "all" ? <Check size={13} /> : state === "partial" ? <span /> : null}</span>;
}

function formatTimestamp(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function parseTimestamp(value = "") {
  const parts = String(value).trim().split(":").map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function getSceneBounds(scene) {
  if (Number.isFinite(scene.start_sec) && Number.isFinite(scene.end_sec)) return [scene.start_sec, scene.end_sec];
  const [start = "00:00:00", end = "00:00:00"] = String(scene.range || "").split("–");
  return [parseTimestamp(start), parseTimestamp(end)];
}

function getFrameTimestamp(scene, frame) {
  const timestamp = scene.keyframes?.[frame]?.timestamp_sec;
  if (Number.isFinite(timestamp)) return timestamp;
  const [start, end] = getSceneBounds(scene);
  return start + ((end - start) * (frame + 1)) / (scene.frameCount + 1);
}

function SelectionSidebar({ scenes: sceneRows, selection, activeScene, onActiveScene, onToggleScene }) {
  return (
    <aside className="scene-rail">
      <div className="rail-heading"><span>场景</span><b>{sceneRows.length} 个{sceneRows.length ? " · 已完成分析" : ""}</b></div>
      {sceneRows.map((scene) => {
        const selectedCount = selection[scene.id].length;
        const state = selectedCount === 0 ? "none" : selectedCount === scene.frameCount ? "all" : "partial";
        return (
          <button key={scene.id} className={`scene-row ${activeScene === scene.id ? "active" : ""}`} onClick={() => onActiveScene(scene.id)}>
            <span onClick={(event) => { event.stopPropagation(); onToggleScene(scene.id); }}><SceneCheckbox state={state} /></span>
            <span className="scene-number">S{String(scene.index).padStart(2, "0")}</span>
            <span className="scene-row-copy"><b>{scene.title}</b><small>{scene.range}</small></span>
            <span className="scene-count">{selectedCount}/{scene.frameCount}</span>
            <ChevronRight size={15} />
          </button>
        );
      })}
      {!sceneRows.length && <div className="scene-rail-empty"><Clapperboard size={22} /><b>等待场景分析</b><span>分析完成后将在此列出场景</span></div>}
      <div className="rail-footnote"><span className="local-pill">本地分析</span> 原视频不会上传</div>
    </aside>
  );
}

function FrameCard({ scene, frame, selected, previewed, onPreview, onToggle }) {
  const frameData = scene.keyframes?.[frame];
  const seconds = getFrameTimestamp(scene, frame);
  return (
    <button className={`frame-card ${selected ? "selected" : ""} ${previewed ? "previewed" : ""}`} onClick={() => { onPreview(); onToggle(); }} aria-pressed={selected} aria-current={previewed ? "true" : undefined}>
      <FrameImage index={frame} src={localMediaUrl(frameData?.path)} alt={`${scene.title}关键帧 ${frame + 1}`} />
      <span className="frame-select">{selected && <Check size={14} />}</span>
      <span className="frame-time">{formatTimestamp(seconds)}</span>
      <span className="frame-label">S{String(scene.index).padStart(2, "0")} · F{String(frame + 1).padStart(2, "0")}</span>
    </button>
  );
}

function GridView({ scene, selected, activeFrame, onPreviewFrame, onToggleFrame }) {
  return <div className="frame-grid">{Array.from({ length: scene.frameCount }, (_, frame) => <FrameCard key={frame} scene={scene} frame={frame} selected={selected.includes(frame)} previewed={activeFrame === frame} onPreview={() => onPreviewFrame(scene.id, frame)} onToggle={() => onToggleFrame(scene.id, frame)} />)}</div>;
}

function ListView({ scene, selected, activeFrame, onPreviewFrame, onToggleFrame }) {
  return (
    <div className="frame-list">
      {Array.from({ length: scene.frameCount }, (_, frame) => (
        <button key={frame} className={`frame-list-row ${selected.includes(frame) ? "selected" : ""} ${activeFrame === frame ? "previewed" : ""}`} onClick={() => { onPreviewFrame(scene.id, frame); onToggleFrame(scene.id, frame); }} aria-current={activeFrame === frame ? "true" : undefined}>
          <SceneCheckbox state={selected.includes(frame) ? "all" : "none"} />
          <FrameImage index={frame} src={localMediaUrl(scene.keyframes?.[frame]?.path)} alt={`${scene.title}关键帧 ${frame + 1}`} />
          <span><b>S{String(scene.index).padStart(2, "0")} · 关键帧 {String(frame + 1).padStart(2, "0")}</b><small>清晰度良好 · 人物遮挡低 · 适合作为学习证据</small></span>
          <time>{formatTimestamp(getFrameTimestamp(scene, frame))}</time>
        </button>
      ))}
    </div>
  );
}

function TimelineView({ scene, selected, activeFrame, onPreviewFrame, onToggleFrame }) {
  return (
    <div className="timeline-view">
      <div className="time-ruler"><span>00:02:35</span><span>00:04:00</span><span>00:05:30</span><span>00:07:48</span></div>
      <div className="timeline-track">
        {Array.from({ length: scene.frameCount }, (_, frame) => (
          <button key={frame} className={`timeline-frame ${selected.includes(frame) ? "selected" : ""} ${activeFrame === frame ? "previewed" : ""}`} onClick={() => { onPreviewFrame(scene.id, frame); onToggleFrame(scene.id, frame); }} aria-current={activeFrame === frame ? "true" : undefined}>
            <FrameImage index={frame} src={localMediaUrl(scene.keyframes?.[frame]?.path)} alt={`${scene.title}关键帧 ${frame + 1}`} />
            <span>F{String(frame + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
      <div className="audio-wave" aria-label="场景音轨波形">{Array.from({ length: 56 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 17) % 30)}px` }} />)}</div>
      <div className="timeline-legend"><span><i className="legend-selected" /> 已选关键帧</span><span><i className="legend-audio" /> 待转写音轨</span></div>
    </div>
  );
}

function EmptySceneWorkspace({ video, onBack }) {
  return (
    <WorkspacePage
      className="selection-page"
      header={<PageHeader density="dense" eyebrow="KEYFRAME SELECTION" title="关键帧选择" description="视频分析完成后，可在此查看场景、关键帧和内容摘要。" actions={<div className="view-switch" aria-label="关键帧视图">
        <button className="active" disabled title="网格视图"><Grid2X2 size={17} /><span>网格</span></button>
        <button disabled title="列表视图"><List size={17} /><span>列表</span></button>
        <button disabled title="时间轴视图"><Rows3 size={17} /><span>时间轴</span></button>
      </div>} />}
      footer={<PageFooter start={<><button className="secondary-button" onClick={onBack}><ChevronLeft size={16} /> 返回素材管理</button><span className="corporate-footer-status"><b>尚未生成场景</b><small>请在视频分析页使用音频或视频分析法</small></span></>} end={<button className="primary-button" disabled>下一步：选择笔记样式 <ChevronRight size={17} /></button>} />}
    >
      <div className="selection-layout selection-layout-empty">
        <SelectionSidebar scenes={[]} selection={{}} activeScene={null} onActiveScene={() => {}} onToggleScene={() => {}} />
        <section className="frame-workspace empty-scene-workspace">
          <header className="workspace-toolbar">
            <div><span className="scene-chip">待分析</span><h2>{video?.name || "当前视频"}</h2><span><Clock3 size={14} /> 场景与时间范围将在分析后生成</span></div>
            <div><button className="ghost-button" disabled><Check size={15} /> 全选本场景</button><button className="icon-button" disabled title="提取设置"><SlidersHorizontal size={18} /></button></div>
          </header>
          <div className="workspace-summary"><Play size={14} fill="currentColor" /><span>智能关键帧 · 等待生成</span><small>内容变化检测</small></div>
          <div className="frame-grid empty-frame-grid" aria-label="等待生成关键帧">
            {Array.from({ length: 3 }, (_, index) => <div className="empty-frame-card" key={index}><span>关键帧 {index + 1}</span></div>)}
          </div>
        </section>
        <aside className="scene-inspector empty-scene-inspector">
          <span className="inspector-label">关键帧预览</span>
          <div className="inspector-image empty-inspector-image"><Clapperboard size={28} /></div>
          <dl><div><dt>镜头编号</dt><dd>待生成</dd></div><div><dt>关键帧时间</dt><dd>待生成</dd></div><div><dt>场景时长</dt><dd>待生成</dd></div><div><dt>画面质量</dt><dd>待分析</dd></div></dl>
          <h3>AI 内容摘要</h3><p>完成视频分析后，将根据场景内容生成摘要。</p>
          <h3>场景语音文字</h3><p>完成音频分析后，将在这里展示对应场景的讲解内容。</p>
        </aside>
      </div>
    </WorkspacePage>
  );
}

export default function SelectionScreen({ scenes: sceneRows = [], selection = {}, activeScene, activeFrame, setActiveScene, onPreviewFrame, onToggleScene, onToggleFrame, view, setView, onNext, onBack, video }) {
  const scene = sceneRows.find((item) => item.id === activeScene) ?? sceneRows[1] ?? sceneRows[0];
  if (!scene) return <EmptySceneWorkspace video={video} onBack={onBack} />;
  const totalSelected = Object.values(selection).reduce((sum, frames) => sum + frames.length, 0);
  const selectedScenes = Object.values(selection).filter((frames) => frames.length > 0).length;
  const selected = selection[scene.id];
  const previewFrameIndex = activeFrame?.sceneId === scene.id ? activeFrame.frameIndex : (selected[0] ?? 0);
  const previewFrame = scene.keyframes?.[previewFrameIndex];
  const [sceneStart, sceneEnd] = getSceneBounds(scene);
  const sceneDuration = Math.max(0, sceneEnd - sceneStart);
  return (
    <WorkspacePage
      className="selection-page"
      header={<PageHeader density="dense" eyebrow="KEYFRAME SELECTION" title="选择关键帧" actions={<div className="view-switch" aria-label="关键帧视图">
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} title="网格视图"><Grid2X2 size={17} /><span>网格</span></button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="列表视图"><List size={17} /><span>列表</span></button>
          <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")} title="时间轴视图"><Rows3 size={17} /><span>时间轴</span></button>
        </div>} />}
      footer={<PageFooter start={<><button className="secondary-button" onClick={onBack}><ChevronLeft size={16} /> 返回视频分析</button><span className="corporate-footer-status"><b>已选 {selectedScenes} 个场景 · {totalSelected} 张关键帧</b><small>预计生成 {selectedScenes} 页临时笔记</small></span></>} end={<button className="primary-button" onClick={onNext} disabled={totalSelected === 0}>下一步：选择笔记样式 <ChevronRight size={17} /></button>} />}
    >
      <div className="selection-layout">
        <SelectionSidebar scenes={sceneRows} selection={selection} activeScene={activeScene} onActiveScene={setActiveScene} onToggleScene={onToggleScene} />
        <section className="frame-workspace">
          <header className="workspace-toolbar">
            <div><span className="scene-chip">场景 {scene.index}</span><h2>{scene.title}</h2><span><Clock3 size={14} /> {scene.range}</span></div>
            <div><button className="ghost-button" onClick={() => onToggleScene(scene.id)}><Check size={15} /> {selected.length === scene.frameCount ? "取消本场景" : "全选本场景"}</button><button className="icon-button" title="提取设置" onClick={() => announce("关键帧提取设置已保留默认策略")}><SlidersHorizontal size={18} /></button></div>
          </header>
          <div className="workspace-summary"><Play size={14} fill="currentColor" /><span>智能关键帧 · {scene.frameCount} 张</span><small>内容变化检测</small></div>
          {view === "grid" && <GridView scene={scene} selected={selected} activeFrame={previewFrameIndex} onPreviewFrame={onPreviewFrame} onToggleFrame={onToggleFrame} />}
          {view === "list" && <ListView scene={scene} selected={selected} activeFrame={previewFrameIndex} onPreviewFrame={onPreviewFrame} onToggleFrame={onToggleFrame} />}
          {view === "timeline" && <TimelineView scene={scene} selected={selected} activeFrame={previewFrameIndex} onPreviewFrame={onPreviewFrame} onToggleFrame={onToggleFrame} />}
        </section>
        <aside className="scene-inspector">
          <span className="inspector-label">关键帧预览</span>
          <FrameImage index={previewFrameIndex} src={localMediaUrl(previewFrame?.path)} className="inspector-image" alt={`${scene.title}关键帧 ${previewFrameIndex + 1} 预览`} />
          <dl><div><dt>镜头编号</dt><dd>S{String(scene.index).padStart(2, "0")} · F{String(previewFrameIndex + 1).padStart(2, "0")}</dd></div><div><dt>关键帧时间</dt><dd>{formatTimestamp(getFrameTimestamp(scene, previewFrameIndex))}</dd></div><div><dt>场景时长</dt><dd>{formatTimestamp(sceneDuration)}</dd></div><div><dt>画面质量</dt><dd><span className="quality-dot" /> 良好</dd></div></dl>
          <h3>AI 内容摘要</h3><p>{scene.summary}</p>
          <h3>场景语音文字</h3><p>{scene.transcript || "该场景未识别到可用语音文字。"}</p>
        </aside>
      </div>
    </WorkspacePage>
  );
}
