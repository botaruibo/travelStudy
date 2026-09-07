export const NOTE_TEMPLATE_FILE_TYPE = "travel-study-note-template";
export const NOTE_TEMPLATE_FILE_VERSION = 1;

export const NOTE_TEMPLATE_BINDINGS = {
  title: "scene.title",
  pageNumber: "scene.scene_index",
  summary: "scene.summary",
  transcript: "scene.transcript",
  studyAdvice: "scene.study_advice",
  frames: "scene.keyframes",
};

export const NOTE_THEMES = {
  green: {
    accent: "#2d7666",
    paper: "#ffffff",
    surface: "#eaf6ef",
    panel: "#f5fbf7",
    marker: "#b7ddce",
  },
  blue: {
    accent: "#2563eb",
    paper: "#ffffff",
    surface: "#e8f1ff",
    panel: "#f2f7ff",
    marker: "#bfdbfe",
  },
  amber: {
    accent: "#b45309",
    paper: "#ffffff",
    surface: "#fff0d8",
    panel: "#fff6e8",
    marker: "#fed7aa",
  },
};

export const BUILTIN_NOTE_TEMPLATES = [
  {
    id: "standard",
    name: "默认研学笔记模版",
    note: "场景介绍、图片与学习记录",
    layout: "standard",
    defaultAccent: "green",
    bindings: NOTE_TEMPLATE_BINDINGS,
    style: { labelStyle: "standard", paperTexture: "none" },
    source: "builtin",
  },
  {
    id: "cornell",
    name: "康奈尔研学笔记模版",
    note: "提纲、笔记与总结三分区",
    layout: "cornell",
    defaultAccent: "blue",
    bindings: NOTE_TEMPLATE_BINDINGS,
    style: { labelStyle: "brush", paperTexture: "lined" },
    source: "builtin",
  },
];

function validLayout(value) {
  return value === "cornell" ? "cornell" : "standard";
}

function validAccent(value) {
  return NOTE_THEMES[value] ? value : "blue";
}

export function normalizeNoteTemplate(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    note: String(value.note || "导入模版").trim(),
    layout: validLayout(value.layout),
    defaultAccent: validAccent(value.defaultAccent),
    bindings: { ...NOTE_TEMPLATE_BINDINGS, ...(value.bindings || {}) },
    style: {
      labelStyle: value.style?.labelStyle === "brush" ? "brush" : "standard",
      paperTexture: ["none", "lined", "grid"].includes(value.style?.paperTexture) ? value.style.paperTexture : "grid",
    },
    source: value.source === "imported" ? "imported" : "builtin",
    fileVersion: Number(value.fileVersion || NOTE_TEMPLATE_FILE_VERSION),
  };
}

export function resolveNoteTemplate(templateId, definition, customTemplates = []) {
  const candidates = [...BUILTIN_NOTE_TEMPLATES, ...customTemplates];
  const builtin = BUILTIN_NOTE_TEMPLATES.find((template) => template.id === templateId);
  if (builtin) return builtin;
  const fromSettings = definition && definition.id === templateId ? normalizeNoteTemplate(definition) : null;
  return fromSettings || candidates.find((template) => template.id === templateId) || BUILTIN_NOTE_TEMPLATES[0];
}

export function templateTheme(accent, template) {
  return NOTE_THEMES[accent] || NOTE_THEMES[template?.defaultAccent] || NOTE_THEMES.green;
}
