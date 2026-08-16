import React from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Grid2X2,
  List,
  Play,
  Rows3,
  SlidersHorizontal,
} from "lucide-react";
import { scenes } from "../data";
import { announce, FrameImage, Stepper } from "./Shared";

function SceneCheckbox({ state }) {
  return <span className={`scene-checkbox ${state}`} aria-hidden="true">{state === "all" ? <Check size={13} /> : state === "partial" ? <span /> : null}</span>;
}

function SelectionSidebar({ scenes: sceneRows, selection, activeScene, onActiveScene, onToggleScene }) {
  return (
    <aside className="scene-rail">
      <div className="rail-heading"><span>场景</span><b>5 个 · 21:36</b></div>
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
      <div className="rail-footnote"><span className="local-pill">本地分析</span> 原视频不会上传</div>
    </aside>
  );
}

function FrameCard({ scene, frame, selected, onToggle }) {
  const seconds = 35 + frame * 41;
  return (
    <button className={`frame-card ${selected ? "selected" : ""}`} onClick={onToggle} aria-pressed={selected}>
      <FrameImage index={frame} alt={`${scene.title}关键帧 ${frame + 1}`} />
      <span className="frame-select">{selected && <Check size={14} />}</span>
      <span className="frame-time">00:{String(Math.floor(seconds / 60) + 2).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span>
      <span className="frame-label">S{String(scene.index).padStart(2, "0")} · F{String(frame + 1).padStart(2, "0")}</span>
    </button>
  );
}

function GridView({ scene, selected, onToggleFrame }) {
  return <div className="frame-grid">{Array.from({ length: scene.frameCount }, (_, frame) => <FrameCard key={frame} scene={scene} frame={frame} selected={selected.includes(frame)} onToggle={() => onToggleFrame(scene.id, frame)} />)}</div>;
}

function ListView({ scene, selected, onToggleFrame }) {
  return (
    <div className="frame-list">
      {Array.from({ length: scene.frameCount }, (_, frame) => (
        <button key={frame} className={`frame-list-row ${selected.includes(frame) ? "selected" : ""}`} onClick={() => onToggleFrame(scene.id, frame)}>
          <SceneCheckbox state={selected.includes(frame) ? "all" : "none"} />
          <FrameImage index={frame} />
          <span><b>S{String(scene.index).padStart(2, "0")} · 关键帧 {String(frame + 1).padStart(2, "0")}</b><small>清晰度良好 · 人物遮挡低 · 适合作为学习证据</small></span>
          <time>00:0{2 + frame}:1{frame}</time>
        </button>
      ))}
    </div>
  );
}

function TimelineView({ scene, selected, onToggleFrame }) {
  return (
    <div className="timeline-view">
      <div className="time-ruler"><span>00:02:35</span><span>00:04:00</span><span>00:05:30</span><span>00:07:48</span></div>
      <div className="timeline-track">
        {Array.from({ length: scene.frameCount }, (_, frame) => (
          <button key={frame} className={`timeline-frame ${selected.includes(frame) ? "selected" : ""}`} onClick={() => onToggleFrame(scene.id, frame)}>
            <FrameImage index={frame} />
            <span>F{String(frame + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
      <div className="audio-wave" aria-label="场景音轨波形">{Array.from({ length: 56 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 17) % 30)}px` }} />)}</div>
      <div className="timeline-legend"><span><i className="legend-selected" /> 已选关键帧</span><span><i className="legend-audio" /> 待转写音轨</span></div>
    </div>
  );
}

export default function SelectionScreen({ scenes: sceneRows = scenes, selection, activeScene, setActiveScene, onToggleScene, onToggleFrame, view, setView, onNext }) {
  const scene = sceneRows.find((item) => item.id === activeScene) ?? sceneRows[1] ?? sceneRows[0];
  const totalSelected = Object.values(selection).reduce((sum, frames) => sum + frames.length, 0);
  const selectedScenes = Object.values(selection).filter((frames) => frames.length > 0).length;
  const selected = selection[scene.id];
  return (
    <div className="workflow-page">
      <Stepper current={0} />
      <div className="workflow-heading">
        <div><span className="section-kicker">STEP 01 · STORYBOARD</span><h1>挑选要进入游学片段的内容</h1><p>选择一个关键帧会自动保留其场景；切换视图不会改变当前选择。</p></div>
        <div className="view-switch" aria-label="关键帧视图">
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} title="网格视图"><Grid2X2 size={17} /><span>网格</span></button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="列表视图"><List size={17} /><span>列表</span></button>
          <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")} title="时间轴视图"><Rows3 size={17} /><span>时间轴</span></button>
        </div>
      </div>
      <div className="selection-layout">
        <SelectionSidebar scenes={sceneRows} selection={selection} activeScene={activeScene} onActiveScene={setActiveScene} onToggleScene={onToggleScene} />
        <section className="frame-workspace">
          <header className="workspace-toolbar">
            <div><span className="scene-chip">场景 {scene.index}</span><h2>{scene.title}</h2><span><Clock3 size={14} /> {scene.range}</span></div>
            <div><button className="ghost-button" onClick={() => onToggleScene(scene.id)}><Check size={15} /> {selected.length === scene.frameCount ? "取消本场景" : "全选本场景"}</button><button className="icon-button" title="提取设置" onClick={() => announce("关键帧提取设置已保留默认策略")}><SlidersHorizontal size={18} /></button></div>
          </header>
          <div className="workspace-summary"><Play size={14} fill="currentColor" /><span>智能关键帧 · {scene.frameCount} 张</span><small>内容变化检测 · 置信度 92%</small></div>
          {view === "grid" && <GridView scene={scene} selected={selected} onToggleFrame={onToggleFrame} />}
          {view === "list" && <ListView scene={scene} selected={selected} onToggleFrame={onToggleFrame} />}
          {view === "timeline" && <TimelineView scene={scene} selected={selected} onToggleFrame={onToggleFrame} />}
        </section>
        <aside className="scene-inspector">
          <span className="inspector-label">场景信息</span>
          <FrameImage index={2} className="inspector-image" />
          <dl><div><dt>镜头编号</dt><dd>S{String(scene.index).padStart(2, "0")}</dd></div><div><dt>场景时长</dt><dd>05:13</dd></div><div><dt>画面质量</dt><dd><span className="quality-dot" /> 良好</dd></div></dl>
          <h3>AI 内容摘要</h3><p>{scene.summary}</p>
          <div className="insight-block"><b>建议</b><span>保留包含叶片近景与学生记录动作的画面，更能体现“观察—记录”的学习过程。</span></div>
        </aside>
      </div>
      <footer className="workflow-footer"><div><b>已选 {selectedScenes} 个场景 · {totalSelected} 张关键帧</b><span>预计生成 {selectedScenes} 页游学片段</span></div><button className="primary-button" onClick={onNext} disabled={totalSelected === 0}>下一步：生成文字 <ChevronRight size={17} /></button></footer>
    </div>
  );
}
