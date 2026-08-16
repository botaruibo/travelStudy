import React from "react";
import { Calendar, Check, FileText, MapPin, Merge, Search } from "lucide-react";
import { clipRows } from "../data";
import { FrameImage } from "./Shared";

export default function LibraryScreen({ clips: clipRowsProp = clipRows, selectedClips, setSelectedClips, onMerge, onOpen }) {
  const toggle = (id) => setSelectedClips((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <div className="page library-page">
      <section className="page-heading split-heading"><div><span className="section-kicker">STUDY TOUR CLIPS</span><h1>游学片段</h1><p>一个视频生成一个 PDF 片段；选择多个片段可合并为完整游学笔记。</p></div><button className="primary-button" onClick={onMerge} disabled={selectedClips.length === 0}><Merge size={17} /> 合并为游学笔记 {selectedClips.length ? `(${selectedClips.length})` : ""}</button></section>
      <div className="library-toolbar"><div className="search-box"><Search size={16} /><input placeholder="搜索文件名、视频或地点" /></div><span>共 4 个片段 · 31 页</span></div>
      <section className="clip-table" aria-label="游学片段列表">
        <header><span>选择</span><span>片段文件</span><span>来源视频</span><span>地点与日期</span><span>页数</span></header>
        {clipRowsProp.map((clip, index) => (
          <button key={clip.id} className={selectedClips.includes(clip.id) ? "selected" : ""} onClick={() => toggle(clip.id)} onDoubleClick={() => onOpen?.(clip.id)}>
            <span className={`scene-checkbox ${selectedClips.includes(clip.id) ? "all" : "none"}`}>{selectedClips.includes(clip.id) && <Check size={13} />}</span>
            <span className="clip-name"><FrameImage index={index} /><span><b>{clip.name}</b><small>PDF · {index % 2 ? "8.6" : "12.4"} MB</small></span></span>
            <span className="source-cell"><FileText size={15} />{clip.source || clip.video_id || "本地视频"}</span>
            <span className="place-cell"><small><MapPin size={14} />{clip.location || "上海"}</small><small><Calendar size={14} />{clip.date || new Date(clip.created_at || Date.now()).toLocaleDateString("zh-CN")}</small></span>
            <b>{clip.pages || clip.page_count || 0} 页</b>
          </button>
        ))}
      </section>
    </div>
  );
}
