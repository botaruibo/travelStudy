import React from "react";
import { CheckCircle2, FileVideo, FolderOpen, Gauge, ScanSearch, Sparkles } from "lucide-react";

export default function WorkbenchScreen({ onStart, onPrefetch, processing }) {
  return (
    <div className="page workbench-page">
      <section className="page-heading split-heading">
        <div>
          <span className="section-kicker">VIDEO TO FIELD NOTE</span>
          <h1>把一次研学视频，整理成可阅读的学习档案</h1>
          <p>导入视频后自动切分关键场景与画面，再由你决定哪些内容值得进入最终游学片段。</p>
        </div>
        <div className="project-stats" aria-label="项目概况">
          <div><b>12</b><span>本月片段</span></div>
          <div><b>4</b><span>游学笔记</span></div>
          <div><b>86</b><span>已整理场景</span></div>
        </div>
      </section>

      <section className="import-stage">
        <div className="import-copy">
          <span className="import-icon"><FileVideo size={28} /></span>
          <h2>导入一段研学视频</h2>
          <p>支持 MP4、MOV、M4V，单文件不超过 8GB。所有素材默认仅保存在本机。</p>
          <div className="import-actions">
            <button className="primary-button" onClick={() => onStart("sample")} onMouseEnter={onPrefetch} onFocus={onPrefetch} disabled={processing}><FolderOpen size={17} /> 使用示例视频</button>
            <button className="secondary-button" onClick={() => onStart("local")} onMouseEnter={onPrefetch} onFocus={onPrefetch}>选择本地文件</button>
          </div>
        </div>
        <div className="import-preview">
          <img src="/botanical-hero.webp" alt="植物园研学活动预览" fetchPriority="high" decoding="async" />
          <div className="video-badge">示例 · 上海植物园</div>
          <div className="preview-meta"><span>植物园研学_上午.mp4</span><b>21:36</b></div>
        </div>
      </section>

      <section className="process-strip" aria-label="自动处理流程">
        <div><ScanSearch size={20} /><span><b>01 场景识别</b>按内容变化切分研学阶段</span></div>
        <div><Gauge size={20} /><span><b>02 关键帧提取</b>每个场景保留 3–6 张证据</span></div>
        <div><Sparkles size={20} /><span><b>03 语音转文字</b>只转写最终选中的场景</span></div>
        <div><CheckCircle2 size={20} /><span><b>04 H5 转 PDF</b>生成可合并的游学片段</span></div>
      </section>
    </div>
  );
}
