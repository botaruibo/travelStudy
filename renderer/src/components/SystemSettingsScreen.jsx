import React from "react";
import { Database, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { MetricStrip, PageHeader } from "./CorporateUI";

export default function SystemSettingsScreen() {
  return <div className="page config-page">
    <PageHeader
      eyebrow="APPLICATION SETTINGS"
      title="应用配置"
      description="管理本地应用级设置与数据存储状态。"
      metrics={<MetricStrip label="系统状态" items={[
        { id: "storage", icon: Database, value: "本地优先", label: "存储模式", tone: "success" },
        { id: "credit", icon: ShieldCheck, value: "已启用", label: "积分功能", tone: "success" },
        { id: "schema", icon: SlidersHorizontal, value: "v1", label: "配置版本" },
      ]} />}
    />
    <section className="config-panel">
      <header><div><SlidersHorizontal size={19} /><span><b>应用设置</b><small>当前版本将项目数据、模型配置和积分记录保存在本机 SQLite 数据库。</small></span></div></header>
      <div className="model-config-grid">
        <article className="model-config-card"><div className="model-config-head"><span><Database size={20} /></span><div><h2>本地优先存储</h2><p>视频素材、任务记录和生成的笔记保留在当前设备，不自动同步到网络服务。</p></div></div></article>
        <article className="model-config-card"><div className="model-config-head"><span><ShieldCheck size={20} /></span><div><h2>积分功能</h2><p>收费 AI 分析会在任务提交时记录积分扣减；任务运行失败不自动退款。</p></div></div></article>
      </div>
    </section>
  </div>;
}
