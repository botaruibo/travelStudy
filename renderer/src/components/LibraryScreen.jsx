import React from "react";
import { Calendar, Check, ExternalLink, FileText, MapPin, Merge, Search, Trash2 } from "lucide-react";
import { FrameImage } from "./Shared";
import { PageHeader } from "./CorporateUI";

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "--");
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export default function LibraryScreen({ clips: clipRowsProp = [], selectedClips, setSelectedClips, onMerge, onOpen, onView, onDelete }) {
  const toggle = (id) => setSelectedClips((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <div className="page library-page">
      <PageHeader
        eyebrow="NOTE CLIPS"
        title="临时笔记"
        description="查看视频生成的 A4 临时笔记，选择多个临时笔记可合并为完整研学笔记。"
        actions={<button className="primary-button" onClick={onMerge} disabled={selectedClips.length === 0}><Merge size={17} /> 合并为研学笔记 {selectedClips.length ? `(${selectedClips.length})` : ""}</button>}
      />
      <div className="library-toolbar"><div className="search-box"><Search size={16} /><input placeholder="搜索文件名、视频或地点" /></div><span>共 {clipRowsProp.length} 个片段 · {clipRowsProp.reduce((total, clip) => total + (clip.page_count || clip.pages || 0), 0)} 页</span></div>
      <section className="clip-table" aria-label="临时笔记列表">
        <header><span>选择</span><span>片段文件</span><span>来源视频</span><span>地点与日期</span><span>页数</span><span>操作</span></header>
        {clipRowsProp.map((clip, index) => (
          <div key={clip.id} className={`clip-table-row ${selectedClips.includes(clip.id) ? "selected" : ""}`}>
            <button className={`scene-checkbox ${selectedClips.includes(clip.id) ? "all" : "none"}`} aria-label={selectedClips.includes(clip.id) ? `取消选择 ${clip.name}` : `选择 ${clip.name}`} onClick={() => toggle(clip.id)}>{selectedClips.includes(clip.id) && <Check size={13} />}</button>
            <span className="clip-name"><FrameImage index={index} /><span><button type="button" className="list-title-link" onClick={() => onView?.(clip)}>{clip.name}</button><small className="clip-id" title={clip.id}>记录 ID：{clip.id}</small><small>PDF · {clip.page_count || clip.pages || 0} 页</small>{clip.path && <small className="clip-path" title={clip.path}>路径：{clip.path}</small>}<span className="clip-actions"><button className="text-button clip-open-button" disabled={clip.exists === false} onClick={() => onOpen?.(clip.id)}><ExternalLink size={13} /> {clip.exists === false ? "文件不存在" : "打开 PDF"}</button></span></span></span>
            <span className="source-cell"><FileText size={15} />{clip.source || clip.video_id || "本地视频"}</span>
            <span className="place-cell"><small><MapPin size={14} />{clip.location || "上海"}</small><small><Calendar size={14} />{formatDateTime(clip.created_at || clip.date)}</small></span>
            <b>{clip.pages || clip.page_count || 0} 页</b>
            <button type="button" className="danger-icon-button list-delete-button" aria-label={`删除 ${clip.name}`} title="删除片段" onClick={() => onDelete?.(clip)}><Trash2 size={18} /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
