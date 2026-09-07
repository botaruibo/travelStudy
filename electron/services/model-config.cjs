const { nowInChina } = require('./time.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { decryptSecret, encryptSecret } = require('./secret-storage.cjs');
const { resolveConfigFile, shouldStripModelSecrets } = require('./runtime-paths.cjs');

const MODEL_CONFIG_KEY = 'AIConfig';

function promptDefaults() {
  const configPath = resolveConfigFile('prompts.json') || path.join(__dirname, '..', 'config', 'prompts.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function defaultSecretFromEnv(key) {
  return shouldStripModelSecrets() ? '' : (process.env[key] || '');
}

const PROVIDERS = {
  siliconflow: {
    id: 'siliconflow',
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    envKey: 'SILICONFLOW_API_KEY',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
  },
  volcengine: {
    id: 'volcengine',
    name: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    envKey: 'VOLCENGINE_ARK_API_KEY',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },
};

function providerDefaults(providerId) {
  return PROVIDERS[providerId] || PROVIDERS.siliconflow;
}

function defaultModelConfig() {
  return {
    text: {
      category: 'text',
      provider: 'siliconflow',
      providerName: 'SiliconFlow',
      model: process.env.SILICONFLOW_LLM_MODEL || 'deepseek-ai/DeepSeek-V4-Flash',
      apiKey: defaultSecretFromEnv('SILICONFLOW_API_KEY'),
      baseUrl: process.env.SILICONFLOW_BASE_URL || PROVIDERS.siliconflow.baseUrl,
      isDefault: true,
    },
    asr: {
      category: 'asr',
      provider: 'volcengine',
      providerName: '火山引擎',
      model: 'doubao-seed-asr-2.0',
      apiKey: defaultSecretFromEnv('VOLCENGINE_ARK_API_KEY'),
      baseUrl: PROVIDERS.volcengine.baseUrl,
      isDefault: true,
    },
    vision: {
      category: 'vision',
      provider: 'siliconflow',
      providerName: 'SiliconFlow',
      model: 'Qwen/Qwen3-Omni-30B-A3B-Instruct',
      apiKey: defaultSecretFromEnv('SILICONFLOW_API_KEY'),
      baseUrl: PROVIDERS.siliconflow.baseUrl,
      isDefault: true,
    },
  };
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function hydrateStoredSecrets(config = {}) {
  const result = { ...config };
  for (const category of ['text', 'asr', 'vision']) {
    const entry = config[category] || {};
    result[category] = {
      ...entry,
      apiKey: entry.apiKeyEncrypted ? decryptSecret(entry.apiKeyEncrypted) : (entry.apiKey || ''),
    };
  }
  return result;
}

function configForStorage(config) {
  const result = { ...config };
  for (const category of ['text', 'asr', 'vision']) {
    const entry = { ...(config[category] || {}) };
    const encrypted = encryptSecret(entry.apiKey);
    delete entry.apiKey;
    delete entry.hasApiKey;
    delete entry.maskedApiKey;
    if (encrypted) entry.apiKeyEncrypted = encrypted;
    else delete entry.apiKeyEncrypted;
    result[category] = entry;
  }
  return result;
}

function normalizeEntry(entry, category, fallback) {
  const hasKnownProvider = Boolean(PROVIDERS[entry?.provider]);
  const provider = providerDefaults(hasKnownProvider ? entry.provider : fallback.provider);
  return {
    ...fallback,
    ...entry,
    category,
    provider: provider.id,
    providerName: provider.name,
    model: hasKnownProvider ? (entry?.model || fallback.model) : fallback.model,
    baseUrl: hasKnownProvider ? (entry?.baseUrl || provider.baseUrl) : (fallback.baseUrl || provider.baseUrl),
    apiKey: entry?.apiKey ?? fallback.apiKey ?? process.env[provider.envKey] ?? '',
    isDefault: entry?.isDefault !== false,
  };
}

function normalizeModelConfig(config = {}) {
  const defaults = defaultModelConfig();
  return {
    text: normalizeEntry(config.text, 'text', defaults.text),
    asr: normalizeEntry(config.asr, 'asr', defaults.asr),
    vision: normalizeEntry(config.vision, 'vision', defaults.vision),
    prompts: {
      ...promptDefaults(),
      ...(config.prompts || {}),
    },
  };
}

function readModelConfig(db) {
  const row = db.get('SELECT value_json FROM system_config WHERE config_key = ?', [MODEL_CONFIG_KEY]);
  return normalizeModelConfig(hydrateStoredSecrets(parseJson(row?.value_json, {})));
}

async function saveModelConfig(db, config) {
  const previous = readModelConfig(db);
  const value = normalizeModelConfig(config);
  for (const category of ['text', 'asr', 'vision']) {
    // The renderer receives only a masked secret marker. Preserve the stored
    // key when a user saves unrelated changes without entering a new key.
    if (!value[category].apiKey && config?.[category]?.hasApiKey) value[category].apiKey = previous[category].apiKey;
  }
  const stamp = nowInChina();
  await db.run(
    `INSERT INTO system_config (config_key, value_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(config_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [MODEL_CONFIG_KEY, JSON.stringify(configForStorage(value)), stamp, stamp]
  );
  return value;
}

async function migrateModelConfigSecrets(db) {
  const row = db.get('SELECT value_json FROM system_config WHERE config_key = ?', [MODEL_CONFIG_KEY]);
  const stored = parseJson(row?.value_json, {});
  const containsPlainSecret = ['text', 'asr', 'vision'].some((category) => Boolean(stored[category]?.apiKey));
  if (containsPlainSecret) await saveModelConfig(db, readModelConfig(db));
}

async function ensureVolcenginePlanAsrConfig(db) {
  const current = readModelConfig(db);
  const stored = db.get('SELECT value_json FROM system_config WHERE config_key = ?', [MODEL_CONFIG_KEY]);
  const storedConfig = parseJson(stored?.value_json, {});
  if (storedConfig.asr?.provider === 'volcengine'
    && storedConfig.asr?.model === 'doubao-seed-asr-2.0'
    && storedConfig.prompts?.audioSceneAnalysisSystemPrompt
    && storedConfig.prompts?.videoSceneAnalysisSystemPrompt
    && storedConfig.prompts?.legacySceneSplitSystemPrompt
    && storedConfig.prompts?.sceneTranscriptAllocationSystemPrompt) return current;
  const defaults = defaultModelConfig();
  const next = {
    ...current,
    asr: {
      ...defaults.asr,
      apiKey: current.asr.provider === 'volcengine' ? current.asr.apiKey : defaults.asr.apiKey,
    },
  };
  await saveModelConfig(db, next);
  return readModelConfig(db);
}

function modelConfigForDisplay(config) {
  return Object.fromEntries(Object.entries(config).map(([category, entry]) => {
    if (category === 'prompts') return [category, entry];
    const { apiKey, apiKeyEncrypted, ...safeEntry } = entry;
    return [category, { ...safeEntry, apiKey: '', hasApiKey: Boolean(apiKey), maskedApiKey: apiKey ? '********' : '' }];
  }));
}

module.exports = { MODEL_CONFIG_KEY, PROVIDERS, promptDefaults, defaultModelConfig, normalizeModelConfig, readModelConfig, saveModelConfig, migrateModelConfigSecrets, ensureVolcenginePlanAsrConfig, modelConfigForDisplay };
