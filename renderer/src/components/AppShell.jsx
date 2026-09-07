import React from "react";
import {
  BookMarked, BookOpenText, ChevronDown, CircleUserRound, FileStack, FolderKanban, Gift,
  LayoutTemplate, LogOut, PanelLeftClose, Settings, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, WalletCards,
} from "lucide-react";
import { localMediaUrl } from "./Shared";

const navItems = [
  { id: "workbench", label: "工作台", icon: PanelLeftClose, resourceId: "menu.workbench" },
  { id: "after-study", label: "研学笔记", icon: BookOpenText, children: [
    { id: "materials", label: "素材管理", icon: FolderKanban, resourceId: "menu.materials" },
    { id: "library", label: "临时笔记", icon: FileStack, resourceId: "menu.library" },
    { id: "notes", label: "笔记本", icon: BookOpenText, resourceId: "menu.notes" },
  ] },
  { id: "planning", label: "精读笔记", icon: BookMarked, resourceId: "menu.planning" },
  { id: "system-config", label: "系统配置", icon: Settings, children: [
    { id: "profile", label: "个人信息", icon: UserRound, resourceId: "menu.profile" },
    { id: "system-config", label: "应用配置", icon: SlidersHorizontal, resourceId: "menu.application" },
    { id: "ai-config", label: "AI 模型配置", icon: Settings, resourceId: "menu.ai-config" },
    { id: "template-manager", label: "笔记模版", icon: LayoutTemplate, resourceId: "menu.template-manager" },
    { id: "permissions", label: "权限管理", icon: ShieldCheck, resourceId: "menu.permissions" },
  ] },
  { id: "balance-management", label: "积分管理", icon: WalletCards, resourceId: "menu.credits" },
];

function initials(user) {
  return (user?.displayName || user?.username || "?").trim().slice(0, 1);
}

function Avatar({ user, className = "" }) {
  if (user?.avatarPath) return <img className={`sidebar-avatar-image ${className}`} src={localMediaUrl(user.avatarPath)} alt={`${user.displayName} 的头像`} />;
  return <span className={`sidebar-avatar-fallback ${className}`}>{initials(user)}</span>;
}

export default function AppShell({ active, onNavigate, children, projectName, resources = [], user, creditBalance, updateAvailable = false, onRedeem, onLogout }) {
  const [expandedGroups, setExpandedGroups] = React.useState({ "after-study": true, "system-config": true });
  const [accountOpen, setAccountOpen] = React.useState(false);
  const granted = React.useMemo(() => new Set(resources), [resources]);
  const visibleItems = React.useMemo(() => navItems.map((item) => item.children
    ? { ...item, children: item.children.filter((child) => granted.has(child.resourceId)) }
    : item).filter((item) => item.children ? item.children.length > 0 : granted.has(item.resourceId)), [granted]);
  const mobileNavItems = visibleItems.flatMap((item) => item.children ? item.children : [item]).slice(0, 5);
  const navigate = (screen) => {
    setAccountOpen(false);
    onNavigate(screen);
  };
  const toggleGroup = (id) => {
    setAccountOpen(false);
    setExpandedGroups((current) => ({ ...current, [id]: !current[id] }));
  };
  const closeAccountOnContentClick = (event) => {
    if (event.target.closest(".modal, .modal-backdrop")) return;
    setAccountOpen(false);
  };
  const currentBalance = Number(creditBalance || 0).toFixed(1);

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <button className="brand" onClick={() => navigate("workbench")}>
        <span className="brand-mark"><Sparkles size={18} /></span>
        <span>研学笔记</span>
      </button>
      <nav className="side-nav">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          if (item.children) {
            const expanded = expandedGroups[item.id];
            const groupActive = item.children.some((child) => child.id === active);
            return <div className={`nav-group ${expanded ? "expanded" : "collapsed"}`} key={item.id}>
              <div className="nav-group-header">
                <button className={`nav-section-title nav-group-label ${groupActive ? "active" : ""}`} onClick={() => toggleGroup(item.id)} aria-expanded={expanded}><Icon size={17} /><span>{item.label}</span></button>
                <button className="nav-group-toggle" onClick={() => toggleGroup(item.id)} aria-label={`${expanded ? "收起" : "展开"}${item.label}`}><ChevronDown size={15} className="nav-group-chevron" /></button>
              </div>
              {expanded && item.children.map((child) => {
                const ChildIcon = child.icon;
                const activeScreens = child.id === "materials" ? ["materials", "selection", "transcript", "template"] : [child.id];
                return <button key={child.id} className={`nav-item nav-subitem ${activeScreens.includes(active) ? "active" : ""}`} onClick={() => navigate(child.id)}><ChildIcon size={17} /><span>{child.label}</span></button>;
              })}
            </div>;
          }
          return <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
        })}
      </nav>
      <div className="sidebar-foot account-foot">
        <span className="account-connection"><span className="online-dot" />本地素材库已连接</span>
        <div className="account-anchor">
          <button className="sidebar-account-trigger" onClick={() => setAccountOpen((open) => !open)} aria-label="打开用户菜单" aria-expanded={accountOpen}><Avatar user={user} /></button>
          {accountOpen && <section className="account-popover" aria-label="当前登录用户">
            <header><Avatar user={user} className="account-popover-avatar" /><span><b>{user?.displayName}</b><small>已登录</small></span></header>
            <div className="account-popover-stats"><div>剩余积分<strong>{currentBalance}</strong></div><div>版本更新<small className={updateAvailable ? "has-update" : ""}>{updateAvailable ? "发现新版本" : "已是最新"}</small></div></div>
            <button onClick={() => { setAccountOpen(false); onNavigate("profile"); }}><UserRound size={16} />个人信息</button>
            <button onClick={() => { setAccountOpen(false); onNavigate("balance-management"); }}><WalletCards size={16} />积分管理</button>
            <button className="redeem" onClick={() => { setAccountOpen(false); onRedeem?.(); }}><Gift size={16} />积分兑换</button>
            <button className="logout" onClick={() => { setAccountOpen(false); onLogout?.(); }}><LogOut size={16} />退出登录</button>
          </section>}
        </div>
      </div>
    </aside>
    <div className="app-body" onClickCapture={closeAccountOnContentClick}><main className="app-main-content" aria-label={projectName}>{children}</main></div>
    <nav className="mobile-nav" aria-label="移动端导航">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        return <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
      })}
    </nav>
  </div>;
}
