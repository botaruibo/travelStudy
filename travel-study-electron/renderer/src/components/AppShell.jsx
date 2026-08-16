import React from "react";
import { announce } from "./Shared";
import {
  BookOpenText,
  Clapperboard,
  FileStack,
  LayoutTemplate,
  PanelLeftClose,
  Sparkles,
} from "lucide-react";

const navItems = [
  { id: "workbench", label: "工作台", icon: PanelLeftClose },
  { id: "selection", label: "视频加工", icon: Clapperboard },
  { id: "library", label: "游学片段", icon: FileStack },
  { id: "notes", label: "游学笔记", icon: BookOpenText },
  { id: "template", label: "模板中心", icon: LayoutTemplate },
];

export default function AppShell({ active, onNavigate, children, projectName }) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <button className="brand" onClick={() => onNavigate("workbench")}>
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>游学纪</span>
        </button>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id || (active === "transcript" && item.id === "selection");
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span className="online-dot" /> 本地素材库已连接
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div>
            <span className="eyebrow">当前项目</span>
            <strong>{projectName}</strong>
          </div>
          <div className="topbar-meta">
            <span>1080P · 21:36</span>
            <span className="autosave"><span className="online-dot" /> 已自动保存</span>
          <button className="avatar" aria-label="用户菜单" onClick={() => announce("用户菜单将在设置模块开放")}>林</button>
          </div>
        </header>
        <main>{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id || (active === "transcript" && item.id === "selection");
          return (
            <button key={item.id} className={isActive ? "active" : ""} onClick={() => onNavigate(item.id)}>
              <Icon size={18} /><span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
