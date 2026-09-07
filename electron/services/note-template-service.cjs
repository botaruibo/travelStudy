const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_FILE_VERSION = 1;
const TEMPLATE_FILE_TYPE = 'travel-study-note-template';
const ALLOWED_LAYOUTS = new Set(['standard', 'cornell']);
const ALLOWED_ACCENTS = new Set(['green', 'blue', 'amber']);

function safeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function requireText(value, label, maxLength = 120) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) throw new Error(`${label}无效`);
  return text;
}

function normalizeTemplate(input, { imported = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('模版文件格式无效');
  const layout = String(input.layout || '').trim();
  if (!ALLOWED_LAYOUTS.has(layout)) throw new Error('模版布局不受支持');
  const id = safeId(input.id) || `template-${crypto.randomUUID().slice(0, 8)}`;
  const accent = ALLOWED_ACCENTS.has(input.defaultAccent) ? input.defaultAccent : 'blue';
  const bindings = input.bindings && typeof input.bindings === 'object' ? input.bindings : {};
  const style = input.style && typeof input.style === 'object' ? input.style : {};
  return {
    id: imported ? `custom-${id}` : id,
    name: requireText(input.name, '模版名称', 48),
    note: requireText(input.note || '导入模版', '模版说明', 140),
    layout,
    defaultAccent: accent,
    bindings: {
      title: bindings.title === 'scene.title' ? bindings.title : 'scene.title',
      pageNumber: bindings.pageNumber === 'scene.scene_index' ? bindings.pageNumber : 'scene.scene_index',
      summary: bindings.summary === 'scene.summary' ? bindings.summary : 'scene.summary',
      transcript: bindings.transcript === 'scene.transcript' ? bindings.transcript : 'scene.transcript',
      studyAdvice: bindings.studyAdvice === 'scene.study_advice' ? bindings.studyAdvice : 'scene.study_advice',
      frames: bindings.frames === 'scene.keyframes' ? bindings.frames : 'scene.keyframes',
    },
    style: {
      labelStyle: style.labelStyle === 'brush' ? 'brush' : 'standard',
      paperTexture: ['none', 'lined', 'grid'].includes(style.paperTexture) ? style.paperTexture : 'grid',
    },
    source: imported ? 'imported' : 'builtin',
    fileVersion: TEMPLATE_FILE_VERSION,
  };
}

function templateFile(template) {
  return {
    type: TEMPLATE_FILE_TYPE,
    version: TEMPLATE_FILE_VERSION,
    template: normalizeTemplate(template),
  };
}

class NoteTemplateService {
  constructor(storage) {
    this.storage = storage;
  }

  async init() {
    await fs.mkdir(this.storage.paths.templates, { recursive: true });
  }

  async list() {
    await this.init();
    const entries = await fs.readdir(this.storage.paths.templates, { withFileTypes: true });
    const templates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.note-template.json')) continue;
      try {
        const value = JSON.parse(await fs.readFile(path.join(this.storage.paths.templates, entry.name), 'utf8'));
        if (value.type !== TEMPLATE_FILE_TYPE || value.version !== TEMPLATE_FILE_VERSION) continue;
        templates.push({ ...normalizeTemplate(value.template, { imported: true }), fileName: entry.name });
      } catch {
        // Invalid files stay on disk so users can repair them without losing their source.
      }
    }
    return templates.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  async importFile(filePath) {
    await this.init();
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (value.type !== TEMPLATE_FILE_TYPE || value.version !== TEMPLATE_FILE_VERSION) throw new Error('不支持该模版文件版本');
    const template = normalizeTemplate(value.template, { imported: true });
    const target = path.join(this.storage.paths.templates, `${safeId(template.id)}.note-template.json`);
    await fs.writeFile(target, `${JSON.stringify(templateFile({ ...template, id: template.id.replace(/^custom-/, '') }), null, 2)}\n`, 'utf8');
    return { ...template, fileName: path.basename(target) };
  }

  async exportFile(template, filePath) {
    const normalized = normalizeTemplate({ ...template, id: String(template.id || '').replace(/^custom-/, '') });
    await fs.writeFile(filePath, `${JSON.stringify(templateFile(normalized), null, 2)}\n`, 'utf8');
    return { path: filePath, template: normalized };
  }
}

module.exports = {
  NoteTemplateService,
  TEMPLATE_FILE_TYPE,
  TEMPLATE_FILE_VERSION,
  normalizeTemplate,
};
