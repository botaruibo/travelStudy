const fs = require('node:fs/promises');
const { normalizeModelConfig, PROVIDERS } = require('./model-config.cjs');
const { transcribeMp3WithVolcengine } = require('./volcengine-asr.cjs');

const OPENAI_COMPATIBLE = new Set(['siliconflow', 'openai', 'openrouter', 'volcengine']);

function providerName(config) {
  return config?.providerName || PROVIDERS[config?.provider]?.name || config?.provider || '模型供应商';
}

function apiKey(config) {
  const provider = PROVIDERS[config?.provider];
  return config?.apiKey || (provider?.envKey ? process.env[provider.envKey] : '') || '';
}

function baseUrl(config) {
  return String(config?.baseUrl || PROVIDERS[config?.provider]?.baseUrl || '').replace(/\/$/, '');
}

async function readError(response) {
  const body = await response.text().catch(() => '');
  return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`;
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

function sceneMessages(transcript, duration, systemPrompt) {
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `请把下面一段中小学游学视频转写拆分成 3 到 8 个连续场景。每个场景必须包含 title、start_sec、end_sec、summary、transcript。start_sec 和 end_sec 是相对于视频开头的秒数，范围 0 到 ${Math.round(duration)}，必须连续且不能重叠。summary 用中文概括可用于游学手册的知识点。输出格式：{"scenes":[{"title":"","start_sec":0,"end_sec":10,"summary":"","transcript":""}]}\n\n转写文本：\n${transcript.slice(0, 24000)}`,
    },
  ];
}

function sceneTranscriptMessages(transcript, scenes, systemPrompt) {
  const sceneList = scenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
    start_sec: scene.start_sec,
    end_sec: scene.end_sec,
  }));
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `请把全量语音转写按已有视频场景分配。每一段只保留与该场景相关的原话，可适度补充标点但不要编造。每个场景必须返回一次，即使没有可用内容也返回空字符串。输出格式：{"scene_transcripts":[{"id":"场景ID","transcript":"该场景对应转写"}]}\n\n已有场景：\n${JSON.stringify(sceneList)}\n\n全量转写：\n${transcript.slice(0, 24000)}`,
    },
  ];
}

async function transcribeAudio(audioPath, modelConfigs, onProgress, options = {}) {
  const config = normalizeModelConfig(modelConfigs).asr;
  const name = providerName(config);
  if (!config.isDefault) return { text: '', provider: 'fallback', warning: '未启用默认语音识别模型' };
  const key = apiKey(config);
  if (!key) return { text: '', provider: 'fallback', warning: `${name} 模型密钥未配置` };
  if (config.provider !== 'volcengine' || config.model !== 'doubao-seed-asr-2.0') {
    return { text: '', provider: 'fallback', warning: '语音分析法仅支持火山引擎 doubao-seed-asr-2.0 流式模型' };
  }
  return transcribeMp3WithVolcengine({ audioPath, apiKey: key, onProgress, timeOffsetMs: options.timeOffsetMs });
}

const VTT_SCENE_WINDOW_SECONDS = 360;

function vttMessages(vtt, systemPrompt, window) {
  const coverage = window
    ? `本次仅分析 ${Math.round(window.startSec)} 到 ${Math.round(window.endSec)} 秒的字幕。场景必须落在此时间范围内，不得遗漏该范围末尾内容。`
    : '';
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `以下是视频的 WebVTT 字幕文件，请返回场景 JSON。${coverage}\n\n${String(vtt || '')}` },
  ];
}

function vttTimestampToSeconds(value) {
  const [hours, minutes, seconds] = String(value || '').trim().split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)
    ? (hours * 3600) + (minutes * 60) + seconds
    : 0;
}

function splitVttIntoSceneWindows(vtt, windowSeconds = VTT_SCENE_WINDOW_SECONDS) {
  const header = String(vtt || '').match(/^WEBVTT[^\n]*(?:\r?\n){1,2}/)?.[0] || 'WEBVTT\n\n';
  const blocks = String(vtt || '').split(/\r?\n\r?\n/).filter((block) => block.includes('-->'));
  const windows = [];
  let current = [];
  let startSec = null;
  let endSec = null;

  for (const block of blocks) {
    const timestamp = block.match(/(\d{2}:\d{2}:\d{2}[.,]\d+)\s+-->\s+(\d{2}:\d{2}:\d{2}[.,]\d+)/);
    if (!timestamp) continue;
    const cueStart = vttTimestampToSeconds(timestamp[1].replace(',', '.'));
    const cueEnd = vttTimestampToSeconds(timestamp[2].replace(',', '.'));
    if (current.length && cueStart - startSec >= windowSeconds) {
      windows.push({ startSec, endSec, vtt: `${header}${current.join('\n\n')}\n` });
      current = [];
      startSec = null;
      endSec = null;
    }
    if (startSec == null) startSec = cueStart;
    endSec = cueEnd;
    current.push(block);
  }
  if (current.length) windows.push({ startSec, endSec, vtt: `${header}${current.join('\n\n')}\n` });
  const tail = windows.at(-1);
  const previous = windows.at(-2);
  if (tail && previous && tail.endSec - tail.startSec < 60) {
    previous.endSec = tail.endSec;
    previous.vtt = `${previous.vtt.trim()}\n\n${tail.vtt.replace(/^WEBVTT[^\n]*(?:\r?\n){1,2}/, '')}`;
    windows.pop();
  }
  return windows;
}

async function segmentWithOpenAICompatible(config, transcript, duration, systemPrompt) {
  const body = {
    model: config.model,
    stream: false,
    temperature: 0.2,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: sceneMessages(transcript, duration, systemPrompt),
  };
  if (config.provider === 'siliconflow') body.enable_thinking = false;
  const response = await fetch(`${baseUrl(config)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey(config)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${providerName(config)} LLM failed: ${await readError(response)}`);
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content;
}

async function segmentWithGoogle(config, transcript, duration, systemPrompt) {
  const messages = sceneMessages(transcript, duration, systemPrompt);
  const response = await fetch(`${baseUrl(config)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(apiKey(config))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: messages[0].content }] },
      contents: [{ role: 'user', parts: [{ text: messages[1].content }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
      },
    }),
  });
  if (!response.ok) throw new Error(`${providerName(config)} LLM failed: ${await readError(response)}`);
  const payload = await response.json();
  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n');
}

async function completeWithTextModel(config, messages) {
  if (config.provider === 'google') {
    const response = await fetch(`${baseUrl(config)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(apiKey(config))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: messages[0].content }] },
        contents: [{ role: 'user', parts: [{ text: messages[1].content }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }),
    });
    if (!response.ok) throw new Error(`${providerName(config)} LLM failed: ${await readError(response)}`);
    const payload = await response.json();
    return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n');
  }
  if (OPENAI_COMPATIBLE.has(config.provider)) {
    const body = { model: config.model, stream: false, temperature: 0.1, max_tokens: 4096, response_format: { type: 'json_object' }, messages };
    if (config.provider === 'siliconflow') body.enable_thinking = false;
    const response = await fetch(`${baseUrl(config)}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey(config)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${providerName(config)} LLM failed: ${await readError(response)}`);
    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content;
  }
  throw new Error(`${providerName(config)} 暂不支持文本场景分析`);
}

function fallbackSceneTranscripts(transcript, scenes) {
  const text = String(transcript || '').trim();
  if (!text || !scenes.length) return Object.fromEntries(scenes.map((scene) => [scene.id, '']));
  const totalDuration = scenes.reduce((total, scene) => total + Math.max(1, Number(scene.end_sec) - Number(scene.start_sec)), 0);
  let cursor = 0;
  return Object.fromEntries(scenes.map((scene, index) => {
    const ratio = Math.max(1, Number(scene.end_sec) - Number(scene.start_sec)) / totalDuration;
    const end = index === scenes.length - 1 ? text.length : Math.min(text.length, cursor + Math.max(1, Math.round(text.length * ratio)));
    const chunk = text.slice(cursor, end).trim();
    cursor = end;
    return [scene.id, chunk];
  }));
}

async function splitTranscriptByScenes({ transcript, scenes, modelConfigs }) {
  const safeScenes = Array.isArray(scenes) ? scenes : [];
  const fallback = fallbackSceneTranscripts(transcript, safeScenes);
  const normalized = normalizeModelConfig(modelConfigs);
  const config = normalized.text;
  if (!String(transcript || '').trim()) return { transcripts: fallback, provider: 'fallback', warning: '没有检测到可用转写文本' };
  if (!config.isDefault || !apiKey(config)) return { transcripts: fallback, provider: 'fallback', warning: '文本处理模型未配置，已按场景时长分配转写' };
  try {
    const content = await completeWithTextModel(config, sceneTranscriptMessages(transcript, safeScenes, normalized.prompts.sceneTranscriptAllocationSystemPrompt));
    const parsed = parseJsonContent(content);
    const returned = new Map((parsed.scene_transcripts || []).map((item) => [item.id, String(item.transcript || '').trim()]));
    return {
      transcripts: Object.fromEntries(safeScenes.map((scene) => [scene.id, returned.get(scene.id) || fallback[scene.id] || ''])),
      provider: config.provider,
      model: config.model,
    };
  } catch (error) {
    return { transcripts: fallback, provider: 'fallback', warning: `场景文字拆分失败：${error.message}` };
  }
}

async function segmentScenes({ transcript, duration, modelConfigs }) {
  const normalized = normalizeModelConfig(modelConfigs);
  const config = normalized.text;
  const name = providerName(config);
  if (!config.isDefault) return { scenes: [], provider: 'fallback', warning: '未启用默认文本处理模型' };
  if (!transcript.trim()) return { scenes: [], provider: 'fallback', warning: '没有检测到可用转写文本' };
  if (!apiKey(config)) return { scenes: [], provider: 'fallback', warning: `${name} 模型密钥未配置` };

  let content = '';
  if (config.provider === 'google') content = await segmentWithGoogle(config, transcript, duration, normalized.prompts.legacySceneSplitSystemPrompt);
  else if (OPENAI_COMPATIBLE.has(config.provider)) content = await segmentWithOpenAICompatible(config, transcript, duration, normalized.prompts.legacySceneSplitSystemPrompt);
  else throw new Error(`${name} 暂不支持文本场景分析`);

  const parsed = parseJsonContent(content);
  return { scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [], provider: config.provider, model: config.model };
}

function normalizeVttScenes(rawScenes, duration) {
  return (Array.isArray(rawScenes) ? rawScenes : []).map((scene, index) => {
    const start = Number(scene.start_time ?? scene.start_sec ?? 0);
    const end = Number(scene.end_time ?? scene.end_sec ?? start + 1);
    const keyframes = Array.isArray(scene.keyframes) ? scene.keyframes : [];
    return {
      title: String(scene.name || scene.title || `游学场景 ${String(index + 1).padStart(2, '0')}`),
      start_sec: Math.max(0, Math.min(Number(duration) || 0, start)),
      end_sec: Math.max(0, Math.min(Number(duration) || 0, end)),
      summary: String(scene.summary || '待整理场景'),
      study_advice: String(scene.study_advice || scene.studyAdvice || '').trim(),
      transcript: '',
      keyframes: keyframes.map((frame) => ({
        time: Number(frame?.time ?? frame?.timestamp_sec),
        keyword: String(frame?.keyword || '').trim(),
      })).filter((frame) => Number.isFinite(frame.time)),
    };
  }).filter((scene) => scene.end_sec > scene.start_sec);
}

async function segmentVttScenes({ vtt, duration, modelConfigs, onProgress }) {
  const normalized = normalizeModelConfig(modelConfigs);
  const config = normalized.text;
  const name = providerName(config);
  if (!config.isDefault) throw new Error('未启用默认文本处理模型');
  if (!apiKey(config)) throw new Error(`${name} 模型密钥未配置`);
  const windows = splitVttIntoSceneWindows(vtt);
  if (!windows.length) throw new Error('字幕文件中没有可分析的时间轴内容');
  const keywordSet = new Set();
  const scenes = [];
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    onProgress?.({ completed: index, total: windows.length, window });
    const content = await completeWithTextModel(
      config,
      vttMessages(window.vtt, normalized.prompts.audioSceneAnalysisSystemPrompt, window)
    );
    const parsed = parseJsonContent(content);
    for (const keyword of Array.isArray(parsed.keywords) ? parsed.keywords : []) {
      const value = String(keyword).trim();
      if (value) keywordSet.add(value);
    }
    const windowScenes = normalizeVttScenes(parsed.scenes, duration)
      .map((scene) => ({
        ...scene,
        start_sec: Math.max(window.startSec, scene.start_sec),
        end_sec: Math.min(window.endSec, scene.end_sec),
      }))
      .filter((scene) => scene.end_sec > scene.start_sec);
    scenes.push(...windowScenes);
    // #region debug-point D:vtt-window-coverage
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='volcengine-asr-resume';try{const e=fs.readFileSync('.dbg/volcengine-asr-resume.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'D',location:'model-providers.cjs:segmentVttScenes',msg:'[DEBUG] VTT scene window coverage',data:{windowIndex:index + 1,windowCount:windows.length,windowStart:window.startSec,windowEnd:window.endSec,returnedSceneCount:windowScenes.length,lastReturnedEnd:windowScenes.at(-1)?.end_sec||null,studyAdviceCount:windowScenes.filter((scene)=>scene.study_advice).length},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
  }
  onProgress?.({ completed: windows.length, total: windows.length, window: windows.at(-1) });
  return {
    keywords: [...keywordSet].slice(0, 8),
    scenes: scenes.sort((left, right) => left.start_sec - right.start_sec),
    provider: config.provider,
    model: config.model,
  };
}

async function analyzeVideoWithVision({ videoPath, duration, modelConfigs }) {
  const normalized = normalizeModelConfig(modelConfigs);
  const config = normalized.vision;
  const name = providerName(config);
  if (!config.isDefault) throw new Error('未启用默认视频和图片分析模型');
  if (!apiKey(config)) throw new Error(`${name} 模型密钥未配置`);
  const bytes = await fs.readFile(videoPath);
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('压缩视频超过 50MB，无法以内嵌方式发送给视频模型');
  if (config.provider === 'google') {
    // #region debug-point A:vision-request
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='vision-analysis-error';try{const e=fs.readFileSync('.dbg/vision-analysis-error.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'model-providers.cjs:vision-google-request',msg:'[DEBUG] Starting Google vision analysis request',data:{provider:config.provider,model:config.model,videoBytes:bytes.byteLength,duration},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    const response = await fetch(`${baseUrl(config)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(apiKey(config))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: normalized.prompts.videoSceneAnalysisSystemPrompt }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'video/mp4', data: bytes.toString('base64') } }, { text: `请分析这段时长约 ${Math.round(duration)} 秒的游学视频。` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }),
    });
    // #region debug-point C:vision-response
    (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='vision-analysis-error';try{const e=fs.readFileSync('.dbg/vision-analysis-error.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'model-providers.cjs:vision-google-response',msg:'[DEBUG] Google vision analysis response received',data:{status:response.status,statusText:response.statusText,ok:response.ok},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    if (!response.ok) throw new Error(`${name} 视频分析 failed: ${await readError(response)}`);
    const payload = await response.json();
    const parsed = parseJsonContent(payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n'));
    return { keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 8) : [], scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [], provider: config.provider, model: config.model };
  }
  if (!OPENAI_COMPATIBLE.has(config.provider)) throw new Error(`${name} 当前未支持本地 MP4 视频上传`);
  const dataUrl = `data:video/mp4;base64,${bytes.toString('base64')}`;
  // #region debug-point A:vision-request
  (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='vision-analysis-error';try{const e=fs.readFileSync('.dbg/vision-analysis-error.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'model-providers.cjs:vision-openai-request',msg:'[DEBUG] Starting OpenAI-compatible vision analysis request',data:{provider:config.provider,model:config.model,videoBytes:bytes.byteLength,duration},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  const response = await fetch(`${baseUrl(config)}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey(config)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: normalized.prompts.videoSceneAnalysisSystemPrompt },
        { role: 'user', content: [{ type: 'video_url', video_url: { url: dataUrl, detail: 'high', max_frames: 16, fps: 1 } }, { type: 'text', text: `请分析这段时长约 ${Math.round(duration)} 秒的游学视频。` }] },
      ],
    }),
  });
  // #region debug-point C:vision-response
  (()=>{const fs=require('node:fs');let u='http://127.0.0.1:7778/event',s='vision-analysis-error';try{const e=fs.readFileSync('.dbg/vision-analysis-error.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'model-providers.cjs:vision-openai-response',msg:'[DEBUG] OpenAI-compatible vision analysis response received',data:{status:response.status,statusText:response.statusText,ok:response.ok},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  if (!response.ok) throw new Error(`${name} 视频分析 failed: ${await readError(response)}`);
  const payload = await response.json();
  const parsed = parseJsonContent(payload?.choices?.[0]?.message?.content);
  return {
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 8) : [],
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    provider: config.provider,
    model: config.model,
  };
}

module.exports = { transcribeAudio, segmentScenes, segmentVttScenes, splitTranscriptByScenes, analyzeVideoWithVision };
