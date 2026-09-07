import React, { useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { appApi } from "../api";
import { PageHeader } from "./CorporateUI";

export default function PermissionManagementScreen({ onNotice }) {
  const [data, setData] = useState({ users: [], resources: [] });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [granted, setGranted] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      const next = await appApi.listPermissionUsers();
      setData(next);
      const first = next.users?.[0];
      if (first) { setSelectedUserId(first.id); setGranted(new Set(first.resources || [])); }
    } catch (error) { onNotice({ type: "error", message: error.message || "权限读取失败" }); }
  };
  useEffect(() => { void load(); }, []);
  const selected = data.users.find((item) => item.id === selectedUserId);
  const chooseUser = (userId) => {
    const user = data.users.find((item) => item.id === userId);
    setSelectedUserId(userId);
    setGranted(new Set(user?.resources || []));
  };
  const toggle = (resourceId) => setGranted((current) => {
    const next = new Set(current);
    if (next.has(resourceId)) next.delete(resourceId); else next.add(resourceId);
    return next;
  });
  const save = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const result = await appApi.updateUserPermissions({ userId: selectedUserId, resourceIds: [...granted] });
      setData((current) => ({ ...current, users: current.users.map((user) => user.id === selectedUserId ? { ...user, resources: result.resources } : user) }));
      onNotice("权限已保存，用户下次登录时生效");
    } catch (error) { onNotice({ type: "error", message: error.message || "权限保存失败" }); }
    finally { setSaving(false); }
  };
  return <div className="page permission-page">
    <PageHeader eyebrow="ADMIN ONLY" title="权限管理" description="为用户配置可见菜单和可执行功能。该页面仅 admin 可见。" />
    <section className="config-panel permission-panel">
      <header><div><ShieldCheck size={19} /><span><b>资源授权</b><small>授权会在用户下次登录后用于渲染导航和功能按钮。</small></span></div><label className="permission-user-select">用户<select className="corporate-field-control" value={selectedUserId} onChange={(event) => chooseUser(event.target.value)}>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.username}</option>)}</select></label></header>
      <div className="permission-resource-list">
        {data.resources.map((resource) => <label key={resource.id} className="permission-resource-row"><input type="checkbox" checked={granted.has(resource.id)} onChange={() => toggle(resource.id)} /><span><b>{resource.name}</b><small>{resource.id}</small></span><em>{resource.resourceType === "menu" ? "菜单" : "功能"}{resource.isAdminOnly ? " · admin" : ""}</em></label>)}
      </div>
      <footer><span>{selected ? `正在配置 ${selected.displayName}` : "请选择用户"}</span><button type="button" className="primary-button" onClick={save} disabled={saving}><Save size={16} />{saving ? "保存中…" : "保存权限"}</button></footer>
    </section>
  </div>;
}
