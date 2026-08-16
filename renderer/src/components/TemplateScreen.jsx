import React from "react";
import { Check, ChevronLeft, Download, FileText, Image, LayoutTemplate, Palette, Sparkles, Type } from "lucide-react";
import { announce, Stepper } from "./Shared";
import TemplatePaper from "./TemplatePaper";

const templates = [
  { id: "nature", name: "自然观察手账", note: "默认 · 教育任务型", accent: "green" },
  { id: "museum", name: "博物馆探索卡", note: "知识卡片型", accent: "blue" },
  { id: "journey", name: "城市行走日记", note: "图文叙事型", accent: "amber" },
];

export default function TemplateScreen({ settings, setSettings, onBack, onGenerate, standalone = false }) {
  const selectedTemplate = templates.find((template) => template.id === settings.template) ?? templates[0];
  return (
    <div className="workflow-page template-page">
      {!standalone && <Stepper current={2} />}
      <div className="workflow-heading">
        <div><span className="section-kicker">{standalone ? "TEMPLATE CENTER" : "STEP 03 · H5 TEMPLATE"}</span><h1>{standalone ? "研学内容模板" : "选择游学片段模板"}</h1><p>模板由 H5 与 CSS 实时渲染，后续可直接转换为多页 PDF。</p></div>
        <span className="h5-badge"><LayoutTemplate size={15} /> H5 实时渲染</span>
      </div>
      <div className="template-layout">
        <aside className="template-library">
          <span className="inspector-label">模板样式</span>
          {templates.map((template) => (
            <button key={template.id} className={`template-option ${settings.template === template.id ? "selected" : ""}`} onClick={() => setSettings((current) => ({ ...current, template: template.id, accent: template.accent }))}>
              <div className={`mini-paper accent-${template.accent}`}><span /><b /><i /></div>
              <span><b>{template.name}</b><small>{template.note}</small></span>
              {settings.template === template.id && <Check size={16} />}
            </button>
          ))}
          <button className="new-template" onClick={() => announce("AI 模板创建将在后续版本开放") }><Sparkles size={17} /> AI 创建新模板</button>
        </aside>
        <section className="preview-stage">
          <div className="preview-topline"><span>页面 3 / 5 · {selectedTemplate.name}</span><div><button onClick={() => announce("预览缩放：81%")}>-</button><span>82%</span><button onClick={() => announce("预览缩放：83%")}>+</button></div></div>
          <TemplatePaper accent={settings.accent} showEducation={settings.showEducation} handwriting={settings.handwriting} />
          <div className="page-thumbnails"><button onClick={() => announce("已预览第 1 页")}><TemplatePaper compact accent={settings.accent} /><span>01</span></button><button onClick={() => announce("已预览第 2 页")}><TemplatePaper compact accent={settings.accent} /><span>02</span></button><button className="active" onClick={() => announce("已预览第 3 页")}><TemplatePaper compact accent={settings.accent} /><span>03</span></button><button onClick={() => announce("已预览第 4 页")}><TemplatePaper compact accent={settings.accent} /><span>04</span></button></div>
        </section>
        <aside className="template-settings">
          <span className="inspector-label">页面设置</span>
          <label className="setting-row"><span><Palette size={16} /><b>主题颜色</b></span><div className="swatches">{["green", "blue", "amber"].map((color) => <button key={color} className={`${color} ${settings.accent === color ? "active" : ""}`} onClick={() => setSettings((current) => ({ ...current, accent: color }))} aria-label={`选择${color}主题`} />)}</div></label>
          <label className="setting-row"><span><Type size={16} /><b>手写批注</b></span><input type="checkbox" checked={settings.handwriting} onChange={(event) => setSettings((current) => ({ ...current, handwriting: event.target.checked }))} /></label>
          <label className="setting-row"><span><FileText size={16} /><b>教育内容区块</b></span><input type="checkbox" checked={settings.showEducation} onChange={(event) => setSettings((current) => ({ ...current, showEducation: event.target.checked }))} /></label>
          <div className="setting-group"><span><Image size={16} /><b>图片布局</b></span><div className="layout-options"><button className="active" onClick={() => announce("已选择双图布局")}><i /><i /></button><button onClick={() => announce("已选择三图布局")}><i /><i /><i /></button><button onClick={() => announce("已选择单图布局")}><i /></button></div></div>
          <div className="template-note"><b>模板策略</b><p>每页对应一个场景，所选关键帧作为观察证据；文本被拆分为讲解、知识点与反思问题。</p></div>
        </aside>
      </div>
      {!standalone && <footer className="workflow-footer"><button className="text-button" onClick={onBack}><ChevronLeft size={16} /> 返回校订文字</button><div><span>将生成 5 页 · A4 竖版</span><button className="primary-button" onClick={onGenerate}><Download size={17} /> 生成游学片段 PDF</button></div></footer>}
    </div>
  );
}
