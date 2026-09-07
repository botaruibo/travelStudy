import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Code2, Eye, EyeOff, Image, KeyRound, Mic2, Save, Settings2, SlidersHorizontal, Type, WandSparkles } from "lucide-react";
import { appApi, isElectron } from "../api";
import { SharedSelect } from "./Shared";
import { MetricStrip, PageHeader } from "./CorporateUI";

const providers = {
  siliconflow: { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1" },
  openai: { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  volcengine: { id: "volcengine", name: "火山引擎", baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3" },
  openrouter: { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
};

const providerModels = {
  siliconflow: [
    { id: "deepseek-ai/DeepSeek-V4-Flash", tags: ["文本"] },
    { id: "Qwen/Qwen3-32B", tags: ["文本"] },
    { id: "Qwen/Qwen2.5-72B-Instruct", tags: ["文本"] },
    { id: "Qwen/Qwen3-Omni-30B-A3B-Instruct", tags: ["文本", "视觉", "音频"] },
    { id: "Qwen/Qwen3-Omni-30B-A3B-Captioner", tags: ["文本", "视觉", "音频"] },
    { id: "Qwen/Qwen3-VL-32B-Instruct", tags: ["文本", "视觉"] },
    { id: "Qwen/Qwen3-VL-32B-Thinking", tags: ["文本", "视觉"] },
    { id: "Qwen/Qwen2.5-VL-72B-Instruct", tags: ["文本", "视觉"] },
    { id: "Pro/Qwen/Qwen2.5-VL-7B-Instruct", tags: ["文本", "视觉"] },
    { id: "FunAudioLLM/SenseVoiceSmall", tags: ["音频"] },
  ],
  openai: [
    { id: "gpt-4o-mini", tags: ["文本", "视觉"] },
    { id: "gpt-4o", tags: ["文本", "视觉"] },
    { id: "whisper-1", tags: ["音频"] },
    { id: "gpt-4o-mini-transcribe", tags: ["音频"] },
    { id: "gpt-4o-transcribe", tags: ["音频"] },
  ],
  volcengine: [
    { id: "doubao-seed-1-6-250615", tags: ["文本"] },
    { id: "doubao-seed-1-6-thinking-250715", tags: ["文本"] },
    { id: "doubao-seed-1-6-vision-250815", tags: ["文本", "视觉", "音频"] },
    { id: "doubao-seed-1-6-flash-250715", tags: ["文本", "视觉"] },
    { id: "doubao-seed-asr-2.0", tags: ["音频"] },
  ],
  openrouter: [
    { id: "openai/gpt-4o-mini", tags: ["文本", "视觉"] },
    { id: "openai/gpt-4o", tags: ["文本", "视觉"] },
    { id: "anthropic/claude-3.5-sonnet", tags: ["文本", "视觉"] },
    { id: "google/gemini-2.5-flash", tags: ["文本", "视觉", "音频"] },
    { id: "qwen/qwen-vl-plus", tags: ["文本", "视觉"] },
  ],
};

const providerIds = Object.keys(providers);
const modelLabel = (model) => `${model.id} ｜ ${model.tags.join("、")}`;
const modelsForProvider = (providerId) => providerModels[providerId] || [];

const sections = [
  { id: "text", title: "文本处理模型", icon: Type, desc: "用于场景拆分、摘要生成和游学文案整理。" },
  { id: "asr", title: "语音识别模型", icon: Mic2, desc: "用于将压缩视频提取出的 MP3 音频转写为文本。" },
  { id: "vision", title: "视频和图片分析模型", icon: Image, desc: "用于后续图片理解、视频画面分析和多模态素材处理。" },
];

function defaultConfig() {
  return {
    text: { category: "text", provider: "siliconflow", providerName: "SiliconFlow", model: "deepseek-ai/DeepSeek-V4-Flash", apiKey: "", baseUrl: providers.siliconflow.baseUrl, isDefault: true },
    asr: { category: "asr", provider: "volcengine", providerName: "火山引擎", model: "doubao-seed-asr-2.0", apiKey: "", baseUrl: providers.volcengine.baseUrl, isDefault: true },
    vision: { category: "vision", provider: "siliconflow", providerName: "SiliconFlow", model: "Qwen/Qwen3-Omni-30B-A3B-Instruct", apiKey: "", baseUrl: providers.siliconflow.baseUrl, isDefault: true },
    prompts: {
      audioSceneAnalysisSystemPrompt: "",
      videoSceneAnalysisSystemPrompt: "",
    },
  };
}

function normalizeConfig(value) {
  const fallback = defaultConfig();
  const modelConfig = Object.fromEntries(sections.map((section) => {
    const current = value?.[section.id] || fallback[section.id];
    const provider = providers[current.provider] || providers[fallback[section.id].provider];
    const models = modelsForProvider(provider.id);
    return [section.id, { ...fallback[section.id], ...current, provider: provider.id, providerName: provider.name, baseUrl: current.baseUrl || provider.baseUrl, model: models.some((model) => model.id === current.model) ? current.model : models[0]?.id || current.model, isDefault: current.isDefault !== false }];
  }));
  return { ...modelConfig, prompts: { ...fallback.prompts, ...(value?.prompts || {}) } };
}

function SecretInput({ value, maskedValue, onChange }) {
  const [visible, setVisible] = useState(false);
  const placeholder = maskedValue ? (visible ? "已保存模型密钥，输入新密钥以替换" : maskedValue) : "请输入模型密钥";
  return <div className="secret-input"><KeyRound size={16} /><input type={visible ? "text" : "password"} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" /><button type="button" className="icon-button" onClick={() => setVisible((next) => !next)} aria-label={visible ? "隐藏模型密钥" : "显示模型密钥"} title={visible ? "隐藏模型密钥" : "显示模型密钥"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>;
}

export default function SystemConfigScreen({ onNotice }) {
  const [config, setConfig] = useState(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState("");
  const readyCount = useMemo(() => sections.filter((section) => (config[section.id]?.apiKey || config[section.id]?.hasApiKey) && config[section.id]?.isDefault).length, [config]);

  useEffect(() => {
    let cancelled = false;
    appApi.getModelConfig?.().then((value) => { if (!cancelled && value) setConfig(normalizeConfig(value)); }).catch((error) => onNotice?.(error.message || "模型配置读取失败"));
    return () => { cancelled = true; };
  }, [onNotice]);

  const patchSection = (sectionId, patch) => setConfig((current) => normalizeConfig({ ...current, [sectionId]: { ...current[sectionId], ...patch } }));
  const changeProvider = (sectionId, providerId) => {
    const provider = providers[providerId];
    const model = modelsForProvider(providerId)[0]?.id || "";
    patchSection(sectionId, { provider: provider.id, providerName: provider.name, baseUrl: provider.baseUrl, model });
  };
  const toggleJsonEditor = () => {
    if (!jsonEditorOpen) {
      setJsonDraft(JSON.stringify(config, null, 2));
      setJsonError("");
    }
    setJsonEditorOpen((open) => !open);
  };
  const updateJsonDraft = (value) => {
    setJsonDraft(value);
    try {
      JSON.parse(value);
      setJsonError("");
    } catch (error) {
      setJsonError(`JSON 格式错误：${error.message}`);
    }
  };
  const save = async () => {
    let configToSave = config;
    if (jsonEditorOpen) {
      try {
        configToSave = normalizeConfig(JSON.parse(jsonDraft));
        setConfig(configToSave);
        setJsonError("");
      } catch (error) {
        const message = `JSON 格式错误：${error.message}`;
        setJsonError(message);
        onNotice?.(message);
        return;
      }
    }
    setSaving(true);
    try {
      if (isElectron) await appApi.saveModelConfig(configToSave);
      onNotice?.("模型配置已保存，后续视频总结任务会使用当前配置");
    } catch (error) {
      const message = error.message || "模型配置保存失败";
      onNotice?.(message.includes("No handler registered") ? "主进程尚未加载系统配置接口，请完全退出应用后重新启动" : message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="page config-page">
    <PageHeader
      eyebrow="SYSTEM AI SETTINGS"
      title="AI 模型配置"
      description="统一管理文本处理、语音识别、多模态分析模型及其系统 Prompt。"
      metrics={<MetricStrip className="config-stats" label="配置概况" items={[
        { id: "ready", icon: CheckCircle2, value: readyCount, label: "已启用配置", tone: "success" },
        { id: "categories", icon: Settings2, value: sections.length, label: "模型分类" },
      ]} />}
    />

    <section className="config-panel">
      <header><button type="button" className="config-json-trigger" onClick={toggleJsonEditor} aria-expanded={jsonEditorOpen}><SlidersHorizontal size={19} /><span><b>模型配置</b><small>{jsonEditorOpen ? "正在编辑原始 JSON 配置" : "保存后写入本地系统配置表"}</small></span></button><button type="button" className="primary-button" onClick={save} disabled={saving || Boolean(jsonEditorOpen && jsonError)}><Save size={16} /> {saving ? "保存中" : "保存配置"}</button></header>
      {jsonEditorOpen ? <div className="model-config-json-editor">
        <div className="model-config-json-toolbar"><span><Code2 size={17} /> 原始 JSON</span><button type="button" className="text-button" onClick={toggleJsonEditor}>返回表单</button></div>
        <textarea value={jsonDraft} onChange={(event) => updateJsonDraft(event.target.value)} spellCheck="false" aria-label="模型配置 JSON" aria-invalid={Boolean(jsonError)} />
        {jsonError && <p className="model-config-json-error" role="alert">{jsonError}</p>}
      </div> : <><div className="model-config-grid">
        {sections.map((section) => {
          const Icon = section.icon;
          const current = config[section.id];
          const models = modelsForProvider(current.provider);
          return <article className="model-config-card" key={section.id}>
            <div className="model-config-head"><span><Icon size={20} /></span><div><h2>{section.title}</h2><p>{section.desc}</p></div>{current.isDefault && <em><CheckCircle2 size={14} /> 默认</em>}</div>
            <div className="model-form-grid">
              <label><span>模型供应商名称</span><SharedSelect value={current.provider} ariaLabel="模型供应商名称" onChange={(event) => changeProvider(section.id, event.target.value)} options={providerIds.map((providerId) => ({ value: providerId, label: providers[providerId].name }))} /></label>
              <label><span>模型名称</span><SharedSelect value={current.model} ariaLabel="模型名称" onChange={(event) => patchSection(section.id, { model: event.target.value })} options={models.map((model) => ({ value: model.id, label: modelLabel(model) }))} /></label>
              <label className="model-secret"><span>模型密钥</span><SecretInput value={current.apiKey} maskedValue={current.maskedApiKey} onChange={(apiKey) => patchSection(section.id, { apiKey })} /></label>
              <label className="default-check"><input type="checkbox" checked={current.isDefault} onChange={(event) => patchSection(section.id, { isDefault: event.target.checked })} /><span>设置为默认模型</span></label>
            </div>
          </article>;
        })}
      </div>
      <section className="prompt-config-section">
        <div className="prompt-config-heading"><div><WandSparkles size={20} /><span><b>分析 Prompt 管理</b><small>Prompt 会保存到本地系统配置，并在对应的视频分析任务中实时使用。</small></span></div></div>
        <div className="prompt-config-grid">
          <label className="prompt-editor"><span><b>音频分析法 · 文本模型系统 Prompt</b><small>用于将 WebVTT 字幕按时间轴拆分为场景和关键帧。</small></span><textarea value={config.prompts?.audioSceneAnalysisSystemPrompt || ""} onChange={(event) => setConfig((current) => ({ ...current, prompts: { ...current.prompts, audioSceneAnalysisSystemPrompt: event.target.value } }))} placeholder="请输入音频分析法的系统 Prompt" /></label>
          <label className="prompt-editor"><span><b>视频分析法 · 视频模型系统 Prompt</b><small>用于根据压缩视频画面和音频生成场景、摘要与关键帧时间。</small></span><textarea value={config.prompts?.videoSceneAnalysisSystemPrompt || ""} onChange={(event) => setConfig((current) => ({ ...current, prompts: { ...current.prompts, videoSceneAnalysisSystemPrompt: event.target.value } }))} placeholder="请输入视频分析法的系统 Prompt" /></label>
        </div>
      </section>
      </>}
    </section>
  </div>;
}
