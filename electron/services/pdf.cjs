const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const PAGE = { width: 595.28, height: 841.89 };

function wrapText(text, maxChars = 34) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const lines = [];
  for (let index = 0; index < value.length; index += maxChars) lines.push(value.slice(index, index + maxChars));
  return lines.length ? lines : [''];
}

async function loadChineseFont(pdf) {
  const candidates = [
    process.env.TRAVEL_STUDY_FONT,
    // macOS：Arial Unicode 是完整的 TrueType 中文字体，pdf-lib/fontkit 可稳定嵌入。
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    // Windows
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\NotoSansSC-VF.ttf',
    // Linux
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const bytes = await fs.readFile(candidate);
      pdf.registerFontkit(fontkit);
      return pdf.embedFont(bytes, { subset: true });
    } catch { /* try the next installed font */ }
  }
  throw new Error('未找到可嵌入的中文字体。请设置 TRAVEL_STUDY_FONT 指向可用的中文 TTF/OTF 字体文件。');
}

async function addImage(pdf, page, imagePath, x, y, width, height) {
  try {
    const bytes = await fs.readFile(imagePath);
    const image = await pdf.embedJpg(bytes);
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, { x: x + (width - drawWidth) / 2, y: y + (height - drawHeight) / 2, width: drawWidth, height: drawHeight });
    return true;
  } catch {
    return false;
  }
}

function scenePageNumber(scene, fallback) {
  const value = Number(scene.scene_index ?? scene.index ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function imageLayout(layout) {
  if (layout === 'single') return { count: 1, columns: 1 };
  if (layout === 'triple') return { count: 3, columns: 3 };
  if (layout === 'six') return { count: 6, columns: 3 };
  return { count: 2, columns: 2 };
}

function themeFor(accent) {
  const paper = rgb(1, 1, 1);
  if (accent === 'blue') return { accent: rgb(0.15, 0.39, 0.92), paper, surface: rgb(0.91, 0.95, 1), panel: rgb(0.95, 0.972, 1) };
  if (accent === 'amber') return { accent: rgb(0.71, 0.33, 0.04), paper, surface: rgb(1, 0.94, 0.84), panel: rgb(1, 0.965, 0.9) };
  return { accent: rgb(0.18, 0.46, 0.4), paper, surface: rgb(0.92, 0.965, 0.94), panel: rgb(0.96, 0.985, 0.97) };
}

function layoutForSettings(settings) {
  return settings?.templateDefinition?.layout === 'cornell' || settings?.template === 'cornell' ? 'cornell' : 'standard';
}

async function drawCornellPage({ pdf, page, font, scene, frames, pageNumber, settings, theme, ink }) {
  const { accent, paper, surface, panel } = theme;
  const line = rgb(0.8, 0.84, 0.9);
  const muted = rgb(0.34, 0.39, 0.46);
  const divider = rgb(0.12, 0.16, 0.19);
  const bodyTop = PAGE.height - 112;
  const summaryTop = 122;
  const cueRight = 186;
  const mainLeft = 206;
  const mainRight = PAGE.width - 42;
  const showSummary = settings.showSummary !== false && settings.showEducation !== false;
  const showImages = settings.showImages !== false;
  const showAdvice = settings.showAdvice !== false;
  const layout = imageLayout(settings.layout);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: paper });
  for (let y = 28; y < PAGE.height - 34; y += 23) page.drawLine({ start: { x: 0, y }, end: { x: PAGE.width, y }, thickness: 0.35, color: line, opacity: 0.55 });
  page.drawText('场景笔记', { x: 42, y: PAGE.height - 44, size: 9, font, color: accent });
  page.drawText(scene.title, { x: 42, y: PAGE.height - 71, size: 20, font, color: ink });
  page.drawText(`第 ${pageNumber} 页`, { x: PAGE.width - 80, y: PAGE.height - 49, size: 9, font, color: muted });
  page.drawLine({ start: { x: 42, y: PAGE.height - 86 }, end: { x: PAGE.width - 42, y: PAGE.height - 86 }, thickness: 1.2, color: divider });
  page.drawLine({ start: { x: cueRight, y: summaryTop }, end: { x: cueRight, y: bodyTop }, thickness: 1.1, color: divider });
  page.drawLine({ start: { x: 42, y: summaryTop }, end: { x: PAGE.width - 42, y: summaryTop }, thickness: 1.1, color: divider });

  page.drawText('提纲区', { x: 44, y: bodyTop - 27, size: 12, font, color: accent });
  let cueY = bodyTop - 58;
  if (showSummary) {
    page.drawText('场景总结', { x: 44, y: cueY, size: 11, font, color: ink });
    cueY -= 18;
    for (const text of wrapText(scene.summary, 17).slice(0, 5)) {
      page.drawText(text, { x: 44, y: cueY, size: 9, font, color: muted });
      cueY -= 14;
    }
    cueY -= 18;
  }
  if (showAdvice) {
    page.drawText('学习建议', { x: 44, y: cueY, size: 11, font, color: ink });
    cueY -= 18;
    for (const text of wrapText(scene.study_advice || '请结合场景内容，提出一个你还想继续了解的问题。', 17).slice(0, 5)) {
      page.drawText(text, { x: 44, y: cueY, size: 9, font, color: muted });
      cueY -= 14;
    }
  }

  page.drawText('笔记区', { x: mainLeft, y: bodyTop - 27, size: 12, font, color: accent });
  const imageGap = 7;
  const imageWidth = (mainRight - mainLeft - imageGap * (layout.columns - 1)) / layout.columns;
  const selectedFrames = frames.slice(0, layout.count);
  const rowCount = Math.max(1, Math.ceil(Math.max(1, selectedFrames.length) / layout.columns));
  const imageHeight = Math.min(74, Math.floor(150 / rowCount));
  const imagesTop = bodyTop - 48;
  if (showImages) {
    for (let index = 0; index < Math.max(1, selectedFrames.length); index += 1) {
      const row = Math.floor(index / layout.columns);
      const column = index % layout.columns;
      const x = mainLeft + column * (imageWidth + imageGap);
      const y = imagesTop - (row + 1) * imageHeight - row * imageGap;
      page.drawRectangle({ x, y, width: imageWidth, height: imageHeight, color: surface });
      if (selectedFrames[index]) await addImage(pdf, page, selectedFrames[index].path, x, y, imageWidth, imageHeight);
    }
  }
  const transcriptTop = showImages
    ? imagesTop - rowCount * imageHeight - (rowCount - 1) * imageGap - 14
    : bodyTop - 48;
  const transcriptBottom = summaryTop + 62;
  page.drawRectangle({ x: mainLeft, y: transcriptBottom, width: mainRight - mainLeft, height: Math.max(48, transcriptTop - transcriptBottom), borderColor: line, borderWidth: 0.8, color: panel, opacity: 0.82 });
  page.drawText('场景全文本内容', { x: mainLeft + 9, y: transcriptTop - 14, size: 9, font, color: accent });
  let transcriptY = transcriptTop - 31;
  for (const text of wrapText(scene.transcript || '暂未识别到场景全文本内容。', 43).slice(0, 7)) {
    page.drawText(text, { x: mainLeft + 9, y: transcriptY, size: 8.5, font, color: muted });
    transcriptY -= 13;
  }
  for (let y = transcriptBottom - 16; y > summaryTop + 8; y -= 17) page.drawLine({ start: { x: mainLeft, y }, end: { x: mainRight, y }, thickness: 0.45, color: line, dashArray: [3, 3] });

  page.drawText('总结区', { x: 44, y: summaryTop - 29, size: 12, font, color: accent });
  page.drawText('留作学生归纳、提问和复盘。', { x: 44, y: summaryTop - 45, size: 8, font, color: muted });
}

async function createClipPdf({ clipId, video, scenes, frameRowsByScene, storage, settings = {} }) {
  const pdf = await PDFDocument.create();
  const font = await loadChineseFont(pdf);
  const theme = themeFor(settings.accent);
  const accent = theme.accent;
  const ink = rgb(0.12, 0.16, 0.19);
  for (const [position, scene] of scenes.entries()) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    const frames = typeof frameRowsByScene.get === 'function' ? (frameRowsByScene.get(scene.id) || []) : (frameRowsByScene[scene.id] || []);
    const sceneNumber = scenePageNumber(scene, position + 1);
    if (layoutForSettings(settings) === 'cornell') {
      await drawCornellPage({ pdf, page, font, scene, frames, pageNumber: sceneNumber, settings, theme, ink });
      continue;
    }
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: theme.paper });
    page.drawRectangle({ x: 0, y: PAGE.height - 12, width: PAGE.width, height: 12, color: accent });
    page.drawText(`研学笔记 · 第 ${sceneNumber} 页`, { x: 42, y: PAGE.height - 68, size: 12, font, color: accent });
    page.drawText(scene.title, { x: 42, y: PAGE.height - 105, size: 25, font, color: ink });
    page.drawText(`${scene.start_sec.toFixed(1)}s – ${scene.end_sec.toFixed(1)}s`, { x: 42, y: PAGE.height - 128, size: 10, font, color: rgb(0.42, 0.45, 0.44) });
    const showSummary = settings.showSummary !== false && settings.showEducation !== false;
    const showImages = settings.showImages !== false;
    const showAdvice = settings.showAdvice !== false;
    if (showSummary) {
      page.drawRectangle({ x: 42, y: PAGE.height - 255, width: PAGE.width - 84, height: 82, color: theme.surface, opacity: 0.76 });
      page.drawText('场景总结', { x: 52, y: PAGE.height - 190, size: 11, font, color: accent });
      let textY = PAGE.height - 214;
      for (const line of wrapText(scene.summary, 34).slice(0, 2)) {
        page.drawText(line, { x: 52, y: textY, size: 11, font, color: ink });
        textY -= 18;
      }
    }
    if (showAdvice) {
      const adviceTop = showImages ? 500 : 400;
      const adviceHeight = 90;
      page.drawRectangle({ x: 42, y: adviceTop - adviceHeight, width: PAGE.width - 84, height: adviceHeight, color: theme.surface, opacity: 0.76 });
      page.drawText('学习建议', { x: 52, y: adviceTop - 22, size: 11, font, color: accent });
      let adviceY = adviceTop - 43;
      for (const line of wrapText(scene.study_advice || '请结合场景内容，提出一个还想继续了解的问题。', 34).slice(0, 3)) {
        page.drawText(line, { x: 52, y: adviceY, size: 9, font, color: ink });
        adviceY -= 15;
      }
    }
    if (showImages) {
      const imageLayoutConfig = imageLayout(settings.layout);
      const selectedFrames = frames.slice(0, imageLayoutConfig.count);
      const imageGap = 12;
      const imageWidth = (PAGE.width - 84 - imageGap * (imageLayoutConfig.columns - 1)) / imageLayoutConfig.columns;
      const imageHeight = imageLayoutConfig.count === 6 ? 84 : 190;
      const imageRows = Math.max(1, Math.ceil(Math.max(1, selectedFrames.length) / imageLayoutConfig.columns));
      const imageY = 142;
      for (let index = 0; index < selectedFrames.length; index += 1) {
        const frame = selectedFrames[index];
        const row = Math.floor(index / imageLayoutConfig.columns);
        const column = index % imageLayoutConfig.columns;
        const x = 42 + column * (imageWidth + imageGap);
        const y = imageY + (imageRows - 1 - row) * (imageHeight + imageGap);
        page.drawRectangle({ x, y, width: imageWidth, height: imageHeight, color: theme.surface });
        await addImage(pdf, page, frame.path, x, y, imageWidth, imageHeight);
        page.drawText(`关键帧 ${index + 1} · ${frame.timestamp_sec.toFixed(1)}s`, { x, y: y - 14, size: 7, font, color: rgb(0.42, 0.45, 0.44) });
      }
    }
    const transcriptTop = showImages ? 86 : (showSummary ? PAGE.height - 290 : PAGE.height - 180);
    page.drawText('来自视频语音转写的学习线索', { x: 42, y: transcriptTop, size: 9, font, color: rgb(0.42, 0.45, 0.44) });
    let transcriptY = transcriptTop - 20;
    for (const line of wrapText(scene.transcript, 75).slice(0, 2)) {
      page.drawText(line, { x: 42, y: transcriptY, size: 8, font, color: rgb(0.35, 0.38, 0.37) });
      transcriptY -= 13;
    }
    page.drawText(`第 ${sceneNumber} 页`, { x: PAGE.width - 76, y: 28, size: 8, font, color: rgb(0.42, 0.45, 0.44) });
  }
  const bytes = await pdf.save();
  const outputPath = storage.clipPath(clipId);
  await fs.writeFile(outputPath, bytes);
  return { path: outputPath, pageCount: scenes.length };
}

async function mergeClipPdfs({ noteId, clipPaths, storage }) {
  const output = await PDFDocument.create();
  for (const clipPath of clipPaths) {
    const source = await PDFDocument.load(await fs.readFile(clipPath));
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  const outputPath = storage.notePath(noteId);
  await fs.writeFile(outputPath, await output.save());
  return { path: outputPath, pageCount: output.getPageCount() };
}

module.exports = { createClipPdf, mergeClipPdfs };
