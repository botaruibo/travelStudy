import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, Eye, FileText, PanelRightOpen, Printer, X } from "lucide-react";
import TemplatePaper, { scenePageNumber } from "./TemplatePaper";
import { announce } from "./Shared";
import { appApi, isElectron } from "../api";
import { resolveNoteTemplate } from "../templates/note-template-registry";

export default function ClipDetailScreen({ detail, onBack, onOpenPdf }) {
  const pages = detail?.pages || [];
  const record = detail?.clip || detail?.note;
  const settings = { template: "standard", accent: "green", layout: "double", showSummary: true, showImages: true, showAdvice: true, ...(detail?.settings || {}) };
  const [pageIndex, setPageIndex] = useState(0);
  const stageRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  useEffect(() => { setPageIndex((current) => Math.min(current, Math.max(0, pages.length - 1))); }, [pages.length]);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateScale = () => {
      const { width, height } = stage.getBoundingClientRect();
      const widthScale = (width - 56) / 440;
      const heightScale = (height - 54) / 622;
      setPreviewScale(Math.max(0.42, Math.min(1, widthScale, heightScale)));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const activePage = pages[pageIndex];
  const templateDefinition = resolveNoteTemplate(settings.template, settings.templateDefinition);
  const templateId = templateDefinition.layout;
  const templateName = templateDefinition.name;
  const displaySummary = typeof settings.showSummary === "boolean" ? settings.showSummary : settings.showEducation !== false;
  const selectedFrames = useMemo(() => activePage?.keyframes || [], [activePage]);
  const handlePrint = async () => {
    if (printing || !pages.length) return;
    setPrinting(true);
    try {
      if (isElectron) {
        const result = await appApi.printTemplate();
        if (!result?.success) throw new Error(result?.failureReason || "系统打印任务未能提交");
        announce("打印任务已提交至系统，请等待打印机或“存储为 PDF”完成");
        return;
      }
      if (typeof window === "undefined" || typeof window.print !== "function") throw new Error("当前运行环境不支持打印");
      window.print();
      announce("已打开浏览器打印窗口，请确认打印或另存为 PDF");
    } catch (error) {
      announce({ type: "error", message: error.message || "打印任务提交失败，请重试" });
    } finally {
      setPrinting(false);
    }
  };
  if (!detail) return null;
  return (
    <div className="page clip-detail-page">
      <section className="page-heading clip-detail-heading">
        <button className="secondary-button clip-detail-back-button" onClick={onBack}><ChevronLeft size={16} /> 返回</button>
        <div className="clip-detail-title"><h1>{record.name}</h1><p>记录 ID：<code>{record.id}</code></p></div>
        <div className="clip-detail-actions"><button className="secondary-button" disabled={!pages.length} onClick={() => setPrintPreviewOpen(true)}><Eye size={16} /> 打印预览</button><button className="secondary-button" disabled={!pages.length || printing} onClick={handlePrint}><Printer size={16} /> {printing ? "正在提交…" : "打印"}</button><button className="primary-button" disabled={record.exists === false} onClick={() => onOpenPdf?.(record.id)}><ExternalLink size={16} /> 打开 PDF</button></div>
      </section>
      <section className="clip-detail-layout">
        <main className="clip-document-stage" ref={stageRef}>
          <div className="clip-document-topline"><span>页面 {Math.min(pageIndex + 1, Math.max(1, pages.length))} / {pages.length || 1} · {templateName}</span></div>
          {activePage ? <div className="clip-paper-fit" style={{ "--clip-paper-scale": previewScale }}><TemplatePaper template={settings.template} templateDefinition={templateDefinition} printLayout accent={settings.accent} layout={settings.layout} showSummary={displaySummary} showImages={settings.showImages} showAdvice={settings.showAdvice} scene={activePage} frames={selectedFrames} transcript={activePage.transcript} pageNumber={scenePageNumber(activePage, pageIndex + 1)} /></div> : <div className="clip-detail-empty"><FileText size={26} /><b>该记录没有可用的页面数据</b><span>生成时保存的场景选择已不可用。</span></div>}
        </main>
        <aside className="clip-page-nav" aria-label="页面导航">
          <div><span className="inspector-label"><PanelRightOpen size={14} /> 页面导航</span><b>{pages.length} 页文档</b></div>
          <nav>{pages.map((scene, index) => { const sceneNumber = scenePageNumber(scene, index + 1); return <button key={scene.id} className={pageIndex === index ? "active" : ""} onClick={() => setPageIndex(index)} aria-current={pageIndex === index ? "page" : undefined}><TemplatePaper template={settings.template} templateDefinition={templateDefinition} compact accent={settings.accent} layout={settings.layout} showSummary={displaySummary} showImages={settings.showImages} showAdvice={settings.showAdvice} scene={scene} frames={scene.keyframes || []} transcript={scene.transcript} pageNumber={sceneNumber} /><span><b>第 {String(sceneNumber).padStart(2, "0")} 页</b><small>{scene.title}</small></span></button>; })}</nav>
        </aside>
      </section>
      <div className="clip-detail-print-pages" aria-hidden="true">{pages.map((scene, index) => <TemplatePaper key={scene.id} template={settings.template} templateDefinition={templateDefinition} printLayout accent={settings.accent} layout={settings.layout} showSummary={displaySummary} showImages={settings.showImages} showAdvice={settings.showAdvice} scene={scene} frames={scene.keyframes || []} transcript={scene.transcript} pageNumber={scenePageNumber(scene, index + 1)} />)}</div>
      {printPreviewOpen && <div className="print-preview-backdrop" role="presentation" onMouseDown={() => setPrintPreviewOpen(false)}>
        <section className="print-preview-modal" role="dialog" aria-modal="true" aria-label="打印预览" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span>PRINT PREVIEW</span><h2>A4 打印预览</h2><small>{pages.length} 页 · 每页对应一个场景</small></div><button className="icon-button" onClick={() => setPrintPreviewOpen(false)} aria-label="关闭打印预览"><X size={18} /></button></header>
          <div className="print-preview-pages">{pages.map((scene, index) => { const sceneNumber = scenePageNumber(scene, index + 1); return <div className="print-preview-page" key={scene.id}><span>第 {sceneNumber} 页</span><TemplatePaper template={settings.template} templateDefinition={templateDefinition} printLayout accent={settings.accent} layout={settings.layout} showSummary={displaySummary} showImages={settings.showImages} showAdvice={settings.showAdvice} scene={scene} frames={scene.keyframes || []} transcript={scene.transcript} pageNumber={sceneNumber} /></div>; })}</div>
          <footer><span>纸张：A4 竖版 · 无页边距缩放</span><div><button className="secondary-button" onClick={() => setPrintPreviewOpen(false)}>返回详情</button><button className="primary-button" onClick={handlePrint} disabled={printing}><Printer size={16} /> {printing ? "正在提交…" : "确认打印"}</button></div></footer>
        </section>
      </div>}
    </div>
  );
}
