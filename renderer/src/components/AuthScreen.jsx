import React, { useEffect, useState } from "react";
import { LockKeyhole, Sparkles, UserRound } from "lucide-react";
import { appApi } from "../api";

const REMEMBER_KEY = "travel-study:remembered-login";

function savedLogin() {
  try { return JSON.parse(window.localStorage.getItem(REMEMBER_KEY) || "null"); } catch { return null; }
}

function loginErrorMessage(error) {
  const message = String(error?.message || "");
  const remotePrefix = /^Error invoking remote method 'auth:login': Error:\s*/;
  if (remotePrefix.test(message)) return message.replace(remotePrefix, "") || "登录失败，请稍后重试";
  return message || "用户名或密码不正确";
}

export default function AuthScreen({ onAuthenticated }) {
  const [form, setForm] = useState({ username: "超级奶妈", password: "", remember: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = savedLogin();
    if (saved?.username && saved?.password) setForm({ username: saved.username === "超级奶妈（id10035）" ? "超级奶妈" : saved.username, password: saved.password, remember: true });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("请输入用户名和密码");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const session = await appApi.login({ username: form.username.trim(), password: form.password });
      if (form.remember) window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: form.username.trim(), password: form.password }));
      else window.localStorage.removeItem(REMEMBER_KEY);
      onAuthenticated(session);
    } catch (nextError) {
      setError(loginErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="auth-page">
    <form className="auth-panel" onSubmit={submit}>
      <span className="auth-mark"><Sparkles size={22} /></span>
      <h1>登录研学笔记</h1>
      <p>使用AI，让整理更简单</p>
      <label><span><UserRound size={15} />用户名</span><input className="corporate-field-control" type="text" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} autoComplete="username" /></label>
      <label><span><LockKeyhole size={15} />密码</span><input className="corporate-field-control" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" placeholder="请输入密码" /></label>
      <small className="auth-hint">首次登录默认密码：cjnmixx</small>
      <label className="auth-remember"><input type="checkbox" checked={form.remember} onChange={(event) => setForm((current) => ({ ...current, remember: event.target.checked }))} />保存密码</label>
      <p className="auth-error" role="alert">{error}</p>
      <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "登录中…" : "登录"}</button>
    </form>
  </main>;
}
