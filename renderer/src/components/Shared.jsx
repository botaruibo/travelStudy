import React from "react";
import { ChevronDown, LoaderCircle, X } from "lucide-react";

export function announce(message) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("travel-study:notice", { detail: message }));
}

export const localMediaUrl = (filePath) => filePath ? `media://local?path=${encodeURIComponent(filePath)}` : "";

export function FrameImage({ index = 0, className = "", alt = "植物观察关键帧", src = "" }) {
  const x = ["0%", "50%", "100%", "0%", "50%", "100%"][index % 6];
  const y = ["0%", "0%", "0%", "100%", "100%", "100%"][index % 6];
  if (src) return <img className={`frame-image ${className}`} src={src} alt={alt} loading="lazy" />;
  return (
    <div
      className={`frame-image ${className}`}
      role="img"
      aria-label={alt}
      style={{ backgroundPosition: `${x} ${y}` }}
    />
  );
}

export function Modal({ title, children, onClose, wide = false, className = "" }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal ${wide ? "wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
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

export function SharedSelect({ value, options = [], onChange, ariaLabel }) {
  return (
    <span className="shared-select">
      <select value={value} onChange={onChange} aria-label={ariaLabel}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={17} aria-hidden="true" />
    </span>
  );
}
