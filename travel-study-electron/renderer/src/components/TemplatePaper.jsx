import React from "react";
import { CheckCircle2, Leaf, MapPin, Search, Sparkles } from "lucide-react";

export default function TemplatePaper({ accent = "green", showEducation = true, handwriting = true, title = "植物 A：叶片的秘密", compact = false }) {
  return (
    <article className={`template-paper accent-${accent} ${compact ? "compact" : ""}`} aria-label="自然观察手账 H5 页面预览">
      <span className="paper-index">FIELD NOTE · 03</span>
      <header className="paper-title"><span><Leaf size={16} /></span><div><small>自然观察任务</small><h2>{title}</h2></div><em>2026.08.15</em></header>
      <div className="paper-location"><MapPin size={12} /> 上海植物园 · 温室馆 <span>09:42</span></div>
      {showEducation && <section className="learning-goal"><b><Sparkles size={13} /> 今日任务</b><p>找出两种不同叶脉，并用照片和一句话记录它们的形态差异。</p></section>}
      <section className="paper-photo-grid"><div className="paper-photo hero-photo"><span>叶片近景</span></div><div className="paper-photo detail-photo"><span>观察记录</span></div><i className="tape tape-one" /><i className="tape tape-two" /></section>
      <section className="paper-caption"><span>01 · 观察证据</span><p>叶片呈椭圆形，主脉从叶柄向叶尖延伸，细小侧脉像羽毛一样排列。</p></section>
      <div className="paper-two-column">
        <section className="specimen-card"><span>知识卡</span><h3>羽状叶脉</h3><p>一条明显主脉，两侧分出许多侧脉，是常见的网状叶脉类型。</p><small>KEYWORD / 观察 · 比较 · 记录</small></section>
        <section className={`hand-note ${handwriting ? "handwriting" : ""}`}><Search size={16} /><b>想一想</b><p>为什么同一株植物的新叶和老叶，颜色会不一样？</p></section>
      </div>
      {showEducation && <footer className="paper-conclusion"><CheckCircle2 size={15} /><span><b>我的发现</b>叶脉不仅支撑叶片，也可能参与水分与养分运输。</span></footer>}
      <span className="botanical-sketch">⌁</span>
    </article>
  );
}
