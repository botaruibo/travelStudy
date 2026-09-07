import React from "react";

export function WorkspacePage({ header, footer, footerMode = footer ? "command" : "none", children, className = "" }) {
  return (
    <div className={`corporate-workspace corporate-workspace--footer-${footerMode} ${className}`.trim()}>
      <div className="corporate-workspace-inner">
        {header}
        <div className="corporate-workspace-content">{children}</div>
      </div>
      {footer}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, metrics, density = "compact", className = "" }) {
  return (
    <header className={`corporate-page-header corporate-page-header--${density} ${className}`.trim()}>
      <div className="corporate-page-heading">
        {eyebrow && <span className="section-kicker">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {(actions || metrics) && <div className="corporate-page-header-side">{metrics}{actions && <div className="corporate-action-group">{actions}</div>}</div>}
    </header>
  );
}

export function PageFooter({ start, end, variant = "command", className = "" }) {
  if (variant === "none") return null;

  return (
    <footer className={`corporate-page-footer corporate-page-footer--${variant} ${className}`.trim()}>
      <div className="corporate-page-footer-start">{start}</div>
      <div className="corporate-page-footer-end">{end}</div>
    </footer>
  );
}

export function MetricStrip({ items = [], label = "数据概况", className = "" }) {
  return (
    <section className={`corporate-metric-strip ${className}`.trim()} aria-label={label}>
      {items.map(({ id, icon: Icon, value, label: itemLabel, tone = "primary" }) => (
        <div className={`corporate-metric tone-${tone}`} key={id || itemLabel}>
          {Icon && <span className="corporate-metric-icon"><Icon size={19} /></span>}
          <span><b>{value}</b><small>{itemLabel}</small></span>
        </div>
      ))}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, actions, className = "" }) {
  return (
    <section className={`corporate-empty-state ${className}`.trim()}>
      {Icon && <span className="corporate-empty-icon"><Icon size={24} /></span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {actions && <div className="corporate-action-group">{actions}</div>}
    </section>
  );
}
