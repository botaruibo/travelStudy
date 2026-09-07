import React, { useMemo, useState } from "react";
import { BookOpenText, Calendar, Check, ChevronDown, Grid2X2, List, MoreHorizontal, Search, Trash2 } from "lucide-react";
import TemplatePaper from "./TemplatePaper";
import { announce } from "./Shared";
import { EmptyState } from "./CorporateUI";

const formatDateTime = (value) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

function NoteCover({ note, index = 0 }) {
  return <div className={`note-library-cover ${note.sample ? "sample" : ""}`}><TemplatePaper compact accent={index % 2 ? "amber" : "green"} /></div>;
}

export default function NotesScreen({ notes = [], notebook = null, onView, onDelete }) {
  const [view, setView] = useState("list");
  const [viewOpen, setViewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => notes.filter((note) => note.name.includes(query) || note.source?.includes(query)), [notes, query]);
  const notebookName = notebook?.name || "默认笔记本";
  const notebookDate = notebook?.last_note_created_at || notes[0]?.created_at || null;
  const notebookCount = Number(notebook?.note_count ?? notes.length);
  const renderActions = (note) => <div className="note-library-actions"><span>已完成</span><button type="button" className="danger-icon-button list-delete-button" aria-label={`删除 ${note.name}`} title="删除笔记" onClick={() => onDelete?.(note)}><Trash2 size={18} /></button></div>;
  return <div className="page notes-library-page">
    <header className="notes-library-header">
      <div className="notebook-context"><div><b>{notebookName}</b><span>当前位置：<em>{notebookName}</em></span><small>{notebookDate ? `${formatDateTime(notebookDate)}　${notebookCount} 篇笔记` : `${notebookCount} 篇笔记`}</small></div></div>
      <div className="notes-toolbar"><label className="notes-search"><span>当前</span><ChevronDown size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="请输入关键字进行搜索" /><Search size={19} /></label><div className="view-menu"><button type="button" className="secondary-button" onClick={() => setViewOpen((open) => !open)}><span>视图</span><ChevronDown size={16} /></button>{viewOpen && <div className="view-options" role="menu"><button type="button" className={view === "list" ? "active" : ""} onClick={() => { setView("list"); setViewOpen(false); }}><List size={16} /> 列表 {view === "list" && <Check size={15} />}</button><button type="button" className={view === "grid" ? "active" : ""} onClick={() => { setView("grid"); setViewOpen(false); }}><Grid2X2 size={16} /> 宫格 {view === "grid" && <Check size={15} />}</button></div>}</div><button type="button" className="secondary-button" onClick={() => announce("排序功能将在后续版本开放")}>排序</button></div>
    </header>
    {!rows.length ? <EmptyState className="notes-empty" icon={BookOpenText} title="暂无研学笔记" description="生成或合并临时笔记后，笔记会保存在这里。" /> : <section className={`notes-library ${view}`} aria-label="研学笔记列表">{rows.map((note, index) => view === "list" ? <article className="note-library-row" key={note.id}><NoteCover note={note} index={index} /><div className="note-library-main"><button type="button" className="list-title-link" onClick={() => onView?.(note)}>{note.name}</button><div className="note-library-meta"><span><Calendar size={14} /> {formatDateTime(note.created_at)}</span><span>{note.page_count || 0} 页</span><span>{note.source || "临时笔记合并"}</span></div><div className="note-tags">{(note.tags || ["研学记录", "学习归纳"]).map((tag) => <span key={tag}>{tag}</span>)}</div></div>{renderActions(note)}<button type="button" className="note-more-button" aria-label={`更多操作：${note.name}`} onClick={() => announce("更多笔记操作将在后续版本开放")}><MoreHorizontal size={21} /></button></article> : <article className="note-library-card" key={note.id}><NoteCover note={note} index={index} /><div className="note-card-content"><button type="button" className="list-title-link" onClick={() => onView?.(note)}>{note.name}</button><div className="note-library-meta"><span>{formatDateTime(note.created_at)}</span><span>{note.page_count || 0} 页</span></div><div className="note-tags">{(note.tags || ["研学记录", "学习归纳"]).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="note-card-footer"><span>已完成</span><button type="button" className="danger-icon-button list-delete-button" aria-label={`删除 ${note.name}`} title="删除笔记" onClick={() => onDelete?.(note)}><Trash2 size={18} /></button></div></div></article>)}</section>}
  </div>;
}
