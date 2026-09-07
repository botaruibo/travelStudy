import React, { useState } from "react";
import { ImageUp, KeyRound, Save, UserRound } from "lucide-react";
import { appApi } from "../api";
import { localMediaUrl } from "./Shared";
import { PageHeader } from "./CorporateUI";

export default function ProfileScreen({ user, onUserChange, onNotice }) {
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const initial = (user?.displayName || user?.username || "?").slice(0, 1);

  const save = async () => {
    if (password && password !== confirmPassword) { onNotice({ type: "error", message: "两次输入的密码不一致" }); return; }
    setSaving(true);
    try {
      const next = await appApi.updateProfile({ username, password: password || undefined });
      onUserChange(next);
      setPassword("");
      setConfirmPassword("");
      onNotice("个人信息已保存");
    } catch (error) {
      onNotice({ type: "error", message: error.message || "个人信息保存失败" });
    } finally {
      setSaving(false);
    }
  };
  const chooseAvatar = async () => {
    setUploading(true);
    try {
      const result = await appApi.pickProfileAvatar();
      if (result?.user) { onUserChange(result.user); onNotice("头像已更新"); }
    } catch (error) {
      onNotice({ type: "error", message: error.message || "头像更新失败" });
    } finally {
      setUploading(false);
    }
  };

  return <div className="page profile-page">
    <PageHeader eyebrow="PERSONAL PROFILE" title="个人信息" description="管理登录账号、头像和本地密码。" />
    <section className="config-panel profile-panel">
      <div className="profile-avatar-column">
        {user?.avatarPath ? <img src={localMediaUrl(user.avatarPath)} className="profile-avatar-image" alt={`${user.displayName} 的头像`} /> : <span className="profile-avatar-placeholder">{initial}</span>}
        <button type="button" className="secondary-button" onClick={chooseAvatar} disabled={uploading}><ImageUp size={16} />{uploading ? "更新中…" : "选择本地头像"}</button>
        <small>{user?.username}</small>
      </div>
      <div className="profile-form">
        <section className="profile-form-section">
          <header><h2>账号信息</h2><p>用于显示和登录。</p></header>
          <div className="profile-field-grid profile-field-grid--single">
            <label><span><UserRound size={15} />登录用户名</span><input className="corporate-field-control" type="text" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={64} /></label>
          </div>
        </section>
        <section className="profile-form-section profile-security-section">
          <header><h2>安全设置</h2><p>留空则保持当前密码不变。</p></header>
          <div className="profile-field-grid">
            <label><span><KeyRound size={15} />新密码</span><input className="corporate-field-control" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="输入新密码" /></label>
            <label><span><KeyRound size={15} />确认新密码</span><input className="corporate-field-control" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="再次输入新密码" /></label>
          </div>
          <p className="profile-security-note">密码将加密后保存</p>
        </section>
        <footer className="profile-form-actions"><button type="button" className="primary-button" onClick={save} disabled={saving}><Save size={16} />{saving ? "保存中…" : "保存个人信息"}</button></footer>
      </div>
    </section>
  </div>;
}
