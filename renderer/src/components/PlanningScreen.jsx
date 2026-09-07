import React from "react";
import { BookMarked, CalendarDays, LibraryBig } from "lucide-react";

export default function PlanningScreen({ onBack }) {
  return <div className="page planning-page">
    <section className="planning-hero">
      <span className="planning-icon"><BookMarked size={28} /></span>
      <span className="section-kicker">STAGE 02 · DEEP READING NOTES</span>
      <h1>精读笔记</h1>
      <p>围绕图书和学习主题完成精读规划，并借助 AI 组织思路、设计可持续积累的阅读笔记。</p>
      <div className="planning-coming"><LibraryBig size={17} /><span>图书管理 · 精读规划 · AI 笔记设计，正在准备中</span></div>
      <button type="button" className="secondary-button" onClick={onBack}><CalendarDays size={16} /> 返回工作台</button>
    </section>
  </div>;
}
