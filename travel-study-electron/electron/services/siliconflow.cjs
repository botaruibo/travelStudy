const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
const ASR_MODEL = process.env.SILICONFLOW_ASR_MODEL || 'FunAudioLLM/SenseVoiceSmall';
const LLM_MODEL = process.env.SILICONFLOW_LLM_MODEL || 'deepseek-ai/DeepSeek-V4-Flash';

function apiKey() {
  return process.env.SILICONFLOW_API_KEY || '';
}

async function readError(response) {
  const body = await response.text().catch(() => '');
  return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`;
}

async function transcribeAudio(audioPath) {
  if (!apiKey()) return { text: '', provider: 'fallback', warning: 'SILICONFLOW_API_KEY 未配置' };
  const bytes = await fs.readFile(audioPath);
  if (bytes.byteLength > 50 * 1024 * 1024) {
    return { text: '', provider: 'fallback', warning: '音频超过 SiliconFlow 50MB 限制，已使用本地占位转写' };
  }
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(audioPath));
  form.append('model', ASR_MODEL);
  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!response.ok) throw new Error(`SiliconFlow ASR failed: ${await readError(response)}`);
  const payload = await response.json();
  return { text: String(payload.text || '').trim(), provider: 'siliconflow', model: ASR_MODEL };
}

function parseJsonContent(content) {
  const raw = String(content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('LLM 返回的场景 JSON 无法解析');
  }
}

async function segmentScenes({ transcript, duration }) {
  if (!apiKey() || !transcript.trim()) {
    return { scenes: [], provider: 'fallback', warning: !apiKey() ? 'SILICONFLOW_API_KEY 未配置' : '没有检测到可用转写文本' };
  }
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      stream: false,
      enable_thinking: false,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是研学视频结构化分析器。只输出 JSON，不要输出 Markdown。',
        },
        {
          role: 'user',
          content: `请把下面一段中小学研学视频转写拆分成 3 到 8 个连续场景。每个场景必须包含 title、start_sec、end_sec、summary、transcript。start_sec 和 end_sec 是相对于视频开头的秒数，范围 0 到 ${Math.round(duration)}，必须连续且不能重叠。summary 用中文概括可用于研学手册的知识点。输出格式：{"scenes":[{"title":"","start_sec":0,"end_sec":10,"summary":"","transcript":""}]}\n\n转写文本：\n${transcript.slice(0, 24000)}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`SiliconFlow LLM failed: ${await readError(response)}`);
  const payload = await response.json();
  const parsed = parseJsonContent(payload?.choices?.[0]?.message?.content);
  return { scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [], provider: 'siliconflow', model: LLM_MODEL };
}

module.exports = { transcribeAudio, segmentScenes, ASR_MODEL, LLM_MODEL };
