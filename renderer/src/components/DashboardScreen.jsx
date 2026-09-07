import React from "react";
import { ArrowRight, BookMarked, BookOpenCheck, FileStack, FolderKanban, NotebookPen, Sparkles } from "lucide-react";
import { MetricStrip } from "./CorporateUI";

export default function DashboardScreen({ videos = [], clips = [], notes = [], tasks = [], onPlan, onMaterials }) {
  const activeTasks = tasks.filter((task) => ["queued", "running"].includes(task.status)).length;
  return <div className="page dashboard-page">
    <section className="dashboard-hero">
      <div>
        <span className="section-kicker">LEARNING MATERIAL HUB</span>
        <h1>把学习材料，变成可持续积累的成长档案</h1>
        <p>研学笔记沉淀视频素材与学习成果，精读笔记将支持图书管理、精读规划和 AI 笔记设计。</p>
      </div>
      <div className="dashboard-actions">
        <button type="button" className="secondary-button" onClick={onPlan}><BookMarked size={17} /> 去精读笔记 <ArrowRight size={15} /></button>
        <button type="button" className="primary-button" onClick={onMaterials}><FolderKanban size={17} /> 去研学笔记 <ArrowRight size={15} /></button>
      </div>
    </section>

    <MetricStrip className="dashboard-stats" label="学习材料统计" items={[
      { id: "materials", icon: FileStack, value: videos.length, label: "本地素材" },
      { id: "clips", icon: BookOpenCheck, value: clips.length, label: "临时笔记", tone: "success" },
      { id: "notes", icon: NotebookPen, value: notes.length, label: "研学笔记" },
      { id: "tasks", icon: Sparkles, value: activeTasks, label: "进行中任务", tone: "warning" },
    ]} />

    <section className="stage-guide" aria-label="学习阶段">
      <article className="stage-card plan-stage">
        <span className="stage-icon"><FolderKanban size={23} /></span>
        <div><span className="section-kicker">STAGE 01</span><h2>研学笔记</h2><p>管理视频等原始素材，提取关键内容并生成临时笔记、研学笔记等学习成果。</p></div>
        <button type="button" className="text-button stage-link" onClick={onMaterials}>进入研学笔记 <ArrowRight size={15} /></button>
      </article>
      <article className="stage-card summary-stage">
        <span className="stage-icon"><BookMarked size={23} /></span>
        <div><span className="section-kicker">STAGE 02</span><h2>精读笔记</h2><p>图书管理、精读规划与 AI 笔记设计功能正在准备中，帮助持续构建高质量阅读笔记。</p></div>
        <button type="button" className="text-button stage-link" onClick={onPlan}>进入精读笔记 <ArrowRight size={15} /></button>
      </article>
    </section>
  </div>;
}
