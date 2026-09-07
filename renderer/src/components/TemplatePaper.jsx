import React from "react";
import { Search, Sparkles } from "lucide-react";
import { localMediaUrl } from "./Shared";
import {
  BUILTIN_NOTE_TEMPLATES,
  resolveNoteTemplate,
  templateTheme,
} from "../templates/note-template-registry";

export const NOTE_TEMPLATES = BUILTIN_NOTE_TEMPLATES;

export function resolveTemplateId(template, definition, customTemplates) {
  return resolveNoteTemplate(template, definition, customTemplates).layout;
}

export function scenePageNumber(scene, fallback = 1) {
  const value = Number(scene?.scene_index ?? scene?.index ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getFrameLimit(layout) {
  return { single: 1, double: 2, triple: 3, six: 6 }[layout] || 2;
}

function sceneBinding(scene, binding, fallback = "") {
  const field = String(binding || "").replace(/^scene\./, "");
  return field && scene?.[field] != null ? scene[field] : fallback;
}

function PageNumber({ value }) {
  return <span className="template-page-number" aria-label={`页码 ${value}`}>第 {String(value).padStart(2, "0")} 页</span>;
}

function PhotoGrid({ sceneTitle, frames, layout, className = "paper-photo-grid" }) {
  const selectedFrames = frames.slice(0, getFrameLimit(layout));
  const photoClass = (index) => index === 0 ? "hero-photo" : index === 1 ? "detail-photo" : "extra-photo";
  return (
    <section className={`${className} layout-${layout}`} aria-label={`${sceneTitle}场景图片`}>
      {selectedFrames.map((frame, index) => (
        <div className={`paper-photo ${photoClass(index)}`} key={frame.id || frame.path || index}>
          {frame.path && <img src={localMediaUrl(frame.path)} alt={`${sceneTitle}场景图片 ${index + 1}`} />}
        </div>
      ))}
      {!selectedFrames.length && <div className="paper-photo hero-photo" aria-label="未选择场景图片" />}
    </section>
  );
}

function StandardTemplate({ accent, displaySummary, showImages, showAdvice, layout, sceneTitle, sceneText, voiceText, studyAdvice, frames, pageValue, compact, printLayout, previewStyle, texture }) {
  return (
    <article className={`template-paper template-standard accent-${accent} texture-${texture} ${displaySummary ? "has-summary" : "without-summary"} ${showImages ? "with-images" : "without-images"} ${showAdvice ? "with-advice" : "without-advice"} ${compact ? "compact" : ""} ${printLayout ? "print-layout" : ""}`} style={previewStyle} aria-label={`${sceneTitle}的默认研学笔记`}>
      <header className="paper-header">
        <div className="paper-title"><h2>{sceneTitle}</h2></div>
        <PageNumber value={pageValue} />
      </header>
      {displaySummary && <section className="learning-goal"><b><Sparkles size={13} /> 场景总结</b><p>{sceneText}</p></section>}
      {showImages && <PhotoGrid sceneTitle={sceneTitle} frames={frames} layout={layout} />}
      <section className="scene-transcript"><b>场景全文本内容</b><p>{voiceText || "暂未识别到场景全文本内容。"}</p></section>
      {showAdvice && <section className="learning-advice"><b><Search size={13} /> 学习建议</b><p>{studyAdvice}</p></section>}
      <footer className="learning-notes"><b>我的发现</b><div aria-label="学习笔记书写区域"><i /><i /><i /></div></footer>
    </article>
  );
}

function CornellTemplate({ accent, displaySummary, showImages, showAdvice, layout, sceneTitle, sceneText, voiceText, studyAdvice, frames, pageValue, compact, printLayout, previewStyle, texture }) {
  return (
    <article className={`template-paper template-cornell accent-${accent} texture-${texture} ${displaySummary ? "has-summary" : "without-summary"} ${showImages ? "with-images" : "without-images"} ${showAdvice ? "with-advice" : "without-advice"} ${compact ? "compact" : ""} ${printLayout ? "print-layout" : ""}`} style={previewStyle} aria-label={`${sceneTitle}的康奈尔研学笔记`}>
      <header className="cornell-paper-header">
        <div><span className="cornell-kicker">场景笔记</span><h2>{sceneTitle}</h2></div>
        <PageNumber value={pageValue} />
      </header>
      <section className="cornell-body">
        <aside className="cornell-cue-zone">
          <span className="cornell-brush-label">提纲区</span>
          {displaySummary && <section className="cornell-cue-block"><h3>场景总结</h3><p>{sceneText}</p></section>}
          {showAdvice && <section className="cornell-cue-block cornell-advice"><h3>学习建议</h3><p>{studyAdvice}</p></section>}
        </aside>
        <section className="cornell-note-zone">
          <span className="cornell-brush-label">笔记区</span>
          {showImages && <PhotoGrid sceneTitle={sceneTitle} frames={frames} layout={layout} className="cornell-photo-grid" />}
          <section className="cornell-cue-block cornell-transcript"><h3>场景全文本内容</h3><p>{voiceText || "暂未识别到场景全文本内容。"}</p></section>
        </section>
      </section>
      <footer className="cornell-summary-zone">
        <div><span className="cornell-brush-label">总结区</span></div>
      </footer>
    </article>
  );
}

export default function TemplatePaper({ template = "standard", templateDefinition, customTemplates = [], accent, showSummary, showEducation, showImages = true, showAdvice = true, layout = "double", title = "植物 A：叶片的秘密", compact = false, printLayout = false, scene, frames = [], transcript, pageNumber = 1 }) {
  const definition = resolveNoteTemplate(template, templateDefinition, customTemplates);
  const templateId = definition.layout;
  const selectedAccent = accent || definition.defaultAccent;
  const theme = templateTheme(selectedAccent, definition);
  const sceneTitle = String(sceneBinding(scene, definition.bindings.title, title) || title);
  const rawSummary = String(sceneBinding(scene, definition.bindings.summary, scene?.summary) || "").trim();
  const hasEditedTranscript = typeof transcript === "string" && transcript.trim().length > 0;
  const boundTranscript = sceneBinding(scene, definition.bindings.transcript, scene?.transcript);
  const editedTranscript = String(hasEditedTranscript ? transcript : boundTranscript || "").trim();
  const displaySummary = typeof showSummary === "boolean" ? showSummary : showEducation !== false;
  const displayImages = showImages !== false;
  const displayAdvice = showAdvice !== false;
  const sceneText = rawSummary || "该场景暂未生成文字介绍。";
  const voiceText = hasEditedTranscript ? editedTranscript : String(boundTranscript || "").trim();
  const studyAdvice = String(sceneBinding(scene, definition.bindings.studyAdvice, scene?.study_advice) || "请结合场景内容，提出一个你还想继续了解的问题。").trim();
  const pageValue = scenePageNumber(scene, pageNumber);
  const firstFrame = localMediaUrl(frames[0]?.path);
  const previewStyle = {
    "--accent": theme.accent,
    "--template-paper": theme.paper,
    "--template-surface": theme.surface,
    "--template-panel": theme.panel,
    "--template-marker": theme.marker,
    ...(firstFrame ? { "--preview-image": `url("${firstFrame}")` } : {}),
  };
  const commonProps = { accent: selectedAccent, displaySummary, showImages: displayImages, showAdvice: displayAdvice, layout, sceneTitle, sceneText, voiceText, studyAdvice, frames, pageValue, compact, printLayout, previewStyle, texture: definition.style.paperTexture };
  return templateId === "cornell" ? <CornellTemplate {...commonProps} /> : <StandardTemplate {...commonProps} />;
}
