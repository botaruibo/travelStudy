import React from "react";
import { AlertTriangle, ChevronRight, Mic2, RotateCcw, Save } from "lucide-react";
import { scenes } from "../data";
import { announce, FrameImage, Stepper } from "./Shared";

export default function TranscriptScreen({ scenes: sceneRows = scenes, selection, transcripts, setTranscripts, onBack, onNext }) {
  const chosenScenes = sceneRows.filter((scene) => (selection[scene.id] || []).length > 0);
  return (
    <div className="workflow-page transcript-page">
      <Stepper current={1} />
      <div className="workflow-heading">
        <div><span className="section-kicker">STEP 02 · TRANSCRIPT</span><h1>校订场景文字</h1><p>文字来自所选场景附近的语音，将作为该页图片的讲解与学习线索。</p></div>
        <button className="secondary-button" onClick={() => announce("文字草稿已保存到本地任务数据")}><Save size={16} /> 保存草稿</button>
      </div>
      <div className="transcript-layout">
        <section className="transcript-editor">
          {chosenScenes.map((scene, sceneIndex) => (
            <article className="transcript-section" key={scene.id}>
              <header><span className="scene-chip">场景 {scene.index}</span><div><h2>{scene.title}</h2><p>{scene.range} · 已选 {selection[scene.id].length} 张关键帧</p></div><span className="confidence">{sceneIndex === 1 ? "86%" : "96%"} 置信度</span></header>
              <div className="transcript-body">
                <div className="selected-thumbs">{selection[scene.id].slice(0, 3).map((frame) => <FrameImage key={frame} index={frame} />)}{selection[scene.id].length > 3 && <span>+{selection[scene.id].length - 3}</span>}</div>
                <label><span><Mic2 size={15} /> 语音转写</span><textarea value={transcripts[scene.id] ?? scene.transcript ?? scene.summary ?? ""} onChange={(event) => setTranscripts((current) => ({ ...current, [scene.id]: event.target.value }))} /></label>
                {sceneIndex === 1 && <div className="low-confidence"><AlertTriangle size={16} /><span><b>“羽状叶脉”可能识别有误</b>建议对照视频在 00:09:12 处确认。</span><button onClick={() => announce("原声播放将在视频详情页打开")}>播放原声</button></div>}
              </div>
            </article>
          ))}
        </section>
        <aside className="transcript-guide">
          <span className="inspector-label">教育内容提示</span>
          <h3>一页不只记录“去了哪里”</h3>
          <ol><li><b>发生了什么</b><span>保留客观活动与讲解事实</span></li><li><b>学到了什么</b><span>明确知识点与观察证据</span></li><li><b>还想追问什么</b><span>留下适合学生反思的问题</span></li></ol>
          <button className="ghost-button" onClick={() => announce("已恢复当前场景的 AI 初稿")}><RotateCcw size={15} /> 恢复 AI 初稿</button>
        </aside>
      </div>
      <footer className="workflow-footer"><button className="text-button" onClick={onBack}>返回选择关键帧</button><button className="primary-button" onClick={onNext}>下一步：选择模板 <ChevronRight size={17} /></button></footer>
    </div>
  );
}
