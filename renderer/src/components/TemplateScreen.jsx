import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Download, Eye, FileDown, FileText, Image, LayoutTemplate, Palette, Printer, Type, Upload, X } from "lucide-react";
import { appApi, isElectron } from "../api";
import { announce } from "./Shared";
import { PageFooter, PageHeader, WorkspacePage } from "./CorporateUI";
import TemplatePaper, { NOTE_TEMPLATES, resolveTemplateId, scenePageNumber } from "./TemplatePaper";
import { resolveNoteTemplate, templateTheme } from "../templates/note-template-registry";

const imageLayouts = [
  { id: "single", label: "单图布局", count: 1 },
  { id: "double", label: "双图布局", count: 2 },
  { id: "triple", label: "三图布局", count: 3 },
  { id: "six", label: "六图布局，两行三列", count: 6 },
];

function templateIpcError(error, action) {
  const message = String(error?.message || "");
  if (/No handler registered.*note-templates/i.test(message)) {
    return `主进程尚未加载模版${action}接口，请完全退出应用后重新启动`;
  }
  return message || `模版${action}失败`;
}

export default function TemplateScreen({ settings, setSettings, onBack, onGenerate, standalone = false, scenes = [], selection = {}, transcripts = {} }) {
  const [importedTemplates, setImportedTemplates] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const templates = useMemo(() => [...NOTE_TEMPLATES, ...importedTemplates], [importedTemplates]);
  const selectedTemplate = resolveNoteTemplate(settings.template, settings.templateDefinition, importedTemplates);
  const templateId = resolveTemplateId(settings.template, settings.templateDefinition, importedTemplates);
  const activeTheme = templateTheme(settings.accent, selectedTemplate);
  const displaySummary = typeof settings.showSummary === "boolean" ? settings.showSummary : settings.showEducation !== false;
  const displayImages = settings.showImages !== false;
  const displayAdvice = settings.showAdvice !== false;
  const pages = useMemo(() => scenes.filter((scene) => (selection[scene.id] || []).length > 0), [scenes, selection]);
  const activePage = pages[pageIndex] || scenes[0];
  const selectedFrames = activePage ? (selection[activePage.id] || []).map((frameIndex) => activePage.keyframes?.[frameIndex]).filter(Boolean) : [];
  const updateSetting = (changes) => setSettings((current) => ({ ...current, ...changes }));
  const pageValue = scenePageNumber(activePage, pageIndex + 1);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  useEffect(() => {
    let cancelled = false;
    appApi.listNoteTemplates().then((rows) => {
      if (!cancelled) setImportedTemplates(Array.isArray(rows) ? rows : []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const selectTemplate = (template) => {
    updateSetting({
      template: template.id,
      templateDefinition: template,
      accent: template.defaultAccent,
    });
  };

  const importTemplate = async () => {
    if (!isElectron) {
      announce({ type: "error", message: "模版导入仅支持桌面端应用" });
      return;
    }
    try {
      const result = await appApi.importNoteTemplate();
      if (result?.canceled || !result?.template) return;
      const template = result.template;
      setImportedTemplates((current) => [...current.filter((item) => item.id !== template.id), template]);
      selectTemplate(template);
      announce(`已导入并选中“${template.name}”`);
    } catch (error) {
      announce({ type: "error", message: templateIpcError(error, "导入") });
    }
  };

  const exportTemplate = async () => {
    if (!isElectron) {
      announce({ type: "error", message: "模版导出仅支持桌面端应用" });
      return;
    }
    try {
      const result = await appApi.exportNoteTemplate(selectedTemplate);
      if (!result?.canceled) announce(`已导出“${selectedTemplate.name}”`);
    } catch (error) {
      announce({ type: "error", message: templateIpcError(error, "导出") });
    }
  };

  const handlePrint = async () => {
    if (printing || !pages.length) return;
    setPrinting(true);
    try {
      if (isElectron) {
        const result = await appApi.printTemplate();
        if (!result?.success) throw new Error(result?.failureReason || "系统打印任务未能提交");
        announce("打印任务已提交至系统，请等待打印机或“存储为 PDF”完成");
      } else {
        window.print();
      }
    } catch (error) {
      announce({ type: "error", message: error.message || "打印任务提交失败，请重试" });
    } finally {
      setPrinting(false);
    }
  };

  const paperProps = (scene, frames, transcript, fallback) => ({
    template: selectedTemplate.id,
    templateDefinition: selectedTemplate,
    accent: settings.accent,
    layout: settings.layout,
    showSummary: displaySummary,
    showImages: displayImages,
    showAdvice: displayAdvice,
    scene,
    frames,
    transcript,
    pageNumber: scenePageNumber(scene, fallback),
  });

  return (
    <WorkspacePage
      className="template-page"
      header={<PageHeader density="dense" eyebrow={standalone ? "NOTE TEMPLATE CENTER" : "NOTE STYLE"} title={standalone ? "笔记模版" : "选择笔记样式"} actions={<div className="template-heading-actions">
          <span className="h5-badge"><LayoutTemplate size={15} /> H5 实时渲染</span>
          <button className="secondary-button template-print-preview-button" disabled={!pages.length} onClick={() => setPrintPreviewOpen(true)}><Eye size={16} /> 打印预览</button>
        </div>} />}
      footer={!standalone ? <PageFooter start={<button className="secondary-button" onClick={onBack}><ChevronLeft size={16} /> 返回</button>} end={<button className="primary-button" onClick={onGenerate} disabled={!pages.length}><Download size={17} /> 生成临时笔记 PDF</button>} /> : null}
    >
      <div className="template-layout">
        <aside className="template-library">
          <div className="template-library-heading"><span className="inspector-label">笔记模版</span><div><button className="icon-button" title="导入模版" aria-label="导入模版" onClick={importTemplate}><Upload size={16} /></button><button className="icon-button" title="导出当前模版" aria-label="导出当前模版" onClick={exportTemplate}><FileDown size={16} /></button></div></div>
          {templates.map((template) => (
            <button key={template.id} className={`template-option ${selectedTemplate.id === template.id ? "selected" : ""}`} onClick={() => selectTemplate(template)} aria-pressed={selectedTemplate.id === template.id}>
              <TemplatePaper compact template={template.id} templateDefinition={template} accent={template.defaultAccent} layout="double" />
              <span><b>{template.name}</b><small>{template.note}</small></span>
              {selectedTemplate.id === template.id && <Check size={16} />}
            </button>
          ))}
        </aside>

        <section className="preview-stage" style={{ "--template-accent": activeTheme.accent }}>
          <div className="preview-topline">
            <span>场景 {pageValue} · {selectedTemplate.name}</span>
            <div><button onClick={() => announce("预览缩放：81%")} aria-label="缩小预览">-</button><span>82%</span><button onClick={() => announce("预览缩放：83%")} aria-label="放大预览">+</button></div>
          </div>
          <div className="template-preview-canvas">
            <TemplatePaper {...paperProps(activePage, selectedFrames, transcripts[activePage?.id], pageIndex + 1)} printLayout />
          </div>
          <div className="page-thumbnail-gallery" aria-label="场景页面画廊">
            <div className="page-thumbnails">
              {pages.map((scene, index) => {
                const frames = (selection[scene.id] || []).map((frameIndex) => scene.keyframes?.[frameIndex]).filter(Boolean);
                const sceneNumber = scenePageNumber(scene, index + 1);
                return <button key={scene.id} className={pageIndex === index ? "active" : ""} onClick={() => setPageIndex(index)} aria-label={`查看场景 ${sceneNumber}：${scene.title}`}><TemplatePaper {...paperProps(scene, frames, transcripts[scene.id], sceneNumber)} compact /><span>{String(sceneNumber).padStart(2, "0")}</span></button>;
              })}
            </div>
          </div>
        </section>

        <aside className="template-settings">
          <span className="inspector-label">页面设置</span>
          <label className="setting-row"><span><Palette size={16} /><b>主题颜色</b></span><div className="swatches">{["green", "blue", "amber"].map((color) => <button key={color} type="button" className={`${color} ${settings.accent === color ? "active" : ""}`} onClick={() => updateSetting({ accent: color })} aria-label={`选择${color}主题`} aria-pressed={settings.accent === color} />)}</div></label>
          <label className="setting-row"><span><FileText size={16} /><b>展示场景总结</b></span><input type="checkbox" checked={displaySummary} onChange={(event) => updateSetting({ showSummary: event.target.checked })} /></label>
          <label className="setting-row"><span><Type size={16} /><b>展示学习建议</b></span><input type="checkbox" checked={displayAdvice} onChange={(event) => updateSetting({ showAdvice: event.target.checked })} /></label>
          <div className="setting-group image-layout-setting"><label><span><Image size={16} /><b>图片布局</b></span><input type="checkbox" checked={displayImages} onChange={(event) => updateSetting({ showImages: event.target.checked })} aria-label="展示场景图片" /></label><div className="layout-options" aria-disabled={!displayImages}>{imageLayouts.map((layout) => <button key={layout.id} type="button" className={`layout-option layout-option-${layout.id} ${settings.layout === layout.id ? "active" : ""}`} onClick={() => updateSetting({ layout: layout.id })} aria-label={layout.label} aria-pressed={settings.layout === layout.id} disabled={!displayImages}>{Array.from({ length: layout.count }, (_, index) => <i key={index} />)}</button>)}</div></div>
          <div className="template-note"><b>{selectedTemplate.name}</b><p>{templateId === "cornell" ? "提纲区展示场景总结和学习建议，笔记区展示图片与全文，总结区保留填写空间。" : "场景总结、图片、全文、学习建议和“我的发现”按 A4 页面顺序排版。"}</p></div>
        </aside>
      </div>

      {printPreviewOpen && <div className="print-preview-backdrop" role="presentation" onMouseDown={() => setPrintPreviewOpen(false)}>
        <section className="print-preview-modal" role="dialog" aria-modal="true" aria-label="模版打印预览" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span>PRINT PREVIEW</span><h2>{selectedTemplate.name}</h2><small>{pages.length} 页 · 每页对应一个场景</small></div><button className="icon-button" onClick={() => setPrintPreviewOpen(false)} aria-label="关闭打印预览"><X size={18} /></button></header>
          <div className="print-preview-pages">{pages.map((scene, index) => { const frames = (selection[scene.id] || []).map((frameIndex) => scene.keyframes?.[frameIndex]).filter(Boolean); const sceneNumber = scenePageNumber(scene, index + 1); return <div className="print-preview-page" key={scene.id}><span>第 {sceneNumber} 页</span><TemplatePaper {...paperProps(scene, frames, transcripts[scene.id], sceneNumber)} printLayout /></div>; })}</div>
          <footer><span>纸张：A4 竖版 · 每页对应一个场景</span><div><button className="secondary-button" onClick={() => setPrintPreviewOpen(false)}>返回模版</button><button className="primary-button" onClick={handlePrint} disabled={printing}><Printer size={16} /> {printing ? "正在提交…" : "确认打印"}</button></div></footer>
        </section>
      </div>}
    </WorkspacePage>
  );
}
