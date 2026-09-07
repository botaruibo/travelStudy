import React, { useEffect, useState } from "react";
import { CreditCard, History, PlusCircle, ReceiptText, Ticket } from "lucide-react";
import { appApi } from "../api";
import { PageHeader } from "./CorporateUI";

const fmt = (value) => Number(value || 0).toFixed(1);
const date = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "-";

export default function BalanceManagementScreen({ onNotice }) {
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("recharge");
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const load = async () => {
    try { setSummary(await appApi.getCreditSummary()); }
    catch (error) { onNotice?.({ type: "error", message: error.message || "余额信息读取失败" }); }
  };
  useEffect(() => { void load(); }, []);
  const redeem = async () => {
    if (!code.trim()) { onNotice?.({ type: "error", message: "请输入兑换码" }); return; }
    setRedeeming(true);
    try {
      const result = await appApi.redeemCreditCode(code);
      if (!result?.ok) { onNotice?.({ type: "error", message: result?.message || "兑换失败" }); return; }
      setCode("");
      await load();
      onNotice?.(`兑换成功，已增加 ${fmt(result.credits)} 积分，当前余额 ${fmt(result.balance?.balance)} 积分。`);
    } catch (error) { onNotice?.({ type: "error", message: error.message || "兑换失败" }); }
    finally { setRedeeming(false); }
  };
  const account = summary?.account;
  const records = tab === "recharge" ? summary?.recentRechargeRecords || [] : summary?.recentConsumptionRecords || [];
  return <div className="page config-page balance-page">
    <PageHeader eyebrow="CREDIT ACCOUNT" title="积分管理" description="兑换记录和 AI 分析扣减均保存在当前设备。" actions={<span className="balance-header-value">{fmt(account?.balance)} 积分</span>} />
    <section className="config-panel balance-summary">
      <header><div><CreditCard size={19} /><span><b>当前积分</b><small>初始赠送 {fmt(account?.initialGranted)} 积分 · 最近更新 {date(account?.updatedAt)}</small></span></div><strong>{fmt(account?.balance)}</strong></header>
      <div className="balance-recharge">
        <label><span><Ticket size={17} aria-hidden="true" />兑换码</span><input className="corporate-field-control" type="text" value={code} onChange={(event) => setCode(event.target.value)} placeholder="请输入 RC1 兑换码" maxLength={8192} /></label>
        <button className="primary-button" onClick={redeem} disabled={redeeming}><PlusCircle size={16} /> {redeeming ? "兑换中" : "兑换"}</button>
      </div>
    </section>
    <section className="config-panel balance-records">
      <header><div><History size={19} /><span><b>积分流水</b><small>兑换码仅在当前本地数据库内防重复使用。</small></span></div></header>
      <div className="balance-tabs"><button className={tab === "recharge" ? "active" : ""} onClick={() => setTab("recharge")}><ReceiptText size={15} />兑换记录</button><button className={tab === "consumption" ? "active" : ""} onClick={() => setTab("consumption")}><CreditCard size={15} />扣减记录</button></div>
      <div className="balance-table-wrap"><table className="balance-table"><thead><tr><th>时间</th><th>{tab === "recharge" ? "类型" : "功能"}</th><th>积分变化</th><th>状态</th></tr></thead><tbody>{records.length ? records.map((record) => <tr key={record.id}><td>{date(record.created_at)}</td><td>{tab === "recharge" ? "兑换码兑换" : record.action_id === "video.analyze.vision" ? "视频场景分析" : "音频场景分析"}</td><td className={tab === "recharge" ? "positive" : "negative"}>{tab === "recharge" ? "+" : "-"}{fmt(record.credits)}</td><td>{record.status === "committed" ? "已扣减" : "成功"}</td></tr>) : <tr><td colSpan="4">暂无记录</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
