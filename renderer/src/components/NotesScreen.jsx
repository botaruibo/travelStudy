import React from "react";
import { BookOpenText, Calendar, Download, MoreHorizontal } from "lucide-react";
import TemplatePaper from "./TemplatePaper";
import { announce } from "./Shared";

export default function NotesScreen({ notes = [], onOpen }) {
  return (
    <div className="page notes-page">
      <section className="page-heading"><span className="section-kicker">STUDY TOUR NOTES</span><h1>游学笔记</h1><p>由一个或多个游学片段合并而成，适合归档、打印或分享给家长。</p></section>
      <section className="notes-grid">
        {(notes.length ? notes : [{ id: "demo-note", name: "上海植物园研学笔记", page_count: 14, created_at: "2026-08-15" }]).map((note) => <article className="note-item" key={note.id}><div className="note-cover"><TemplatePaper compact /></div><div><span className="status-pill">已完成</span><h2>{note.name}</h2><p><Calendar size={14} /> {new Date(note.created_at).toLocaleDateString("zh-CN")} · {note.page_count || 14} 页</p><div><button className="secondary-button" onClick={() => onOpen?.(note.id)}><Download size={15} /> 导出</button><button className="icon-button" onClick={() => announce("更多笔记操作将在后续版本开放")}><MoreHorizontal size={18} /></button></div></div></article>)}
        <button className="empty-note" onClick={() => announce("请先在游学片段中选择 PDF，再创建游学笔记")}><BookOpenText size={27} /><b>创建新的游学笔记</b><span>前往“游学片段”选择一个或多个 PDF</span></button>
      </section>
    </div>
  );
}
