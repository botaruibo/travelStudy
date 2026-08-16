import React from "react";
import { Check, LoaderCircle, X } from "lucide-react";

export function announce(message) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("travel-study:notice", { detail: message }));
}

export function Stepper({ current }) {
  const steps = ["选择素材", "校订文字", "选择模板", "生成"];
  return (
    <ol className="stepper" aria-label="视频加工进度">
      {steps.map((step, index) => (
        <li key={step} className={`${index === current ? "current" : ""} ${index < current ? "done" : ""}`}>
          <span>{index < current ? <Check size={13} /> : index + 1}</span>
          <b>{step}</b>
        </li>
      ))}
    </ol>
  );
}

export function FrameImage({ index = 0, className = "", alt = "植物观察关键帧" }) {
  const x = ["0%", "50%", "100%", "0%", "50%", "100%"][index % 6];
  const y = ["0%", "0%", "0%", "100%", "100%", "100%"][index % 6];
  return (
    <div
      className={`frame-image ${className}`}
      role="img"
      aria-label={alt}
      style={{ backgroundPosition: `${x} ${y}` }}
    />
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
        {children}
      </section>
    </div>
  );
}

export function ProcessingOverlay({ label }) {
  return (
    <div className="processing-overlay" role="status">
      <LoaderCircle className="spin" size={32} />
      <strong>{label}</strong>
      <span>演示模式将在片刻后完成</span>
    </div>
  );
}
