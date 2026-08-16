const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
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
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\NotoSansSC-VF.ttf',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const bytes = await fs.readFile(candidate);
      pdf.registerFontkit(fontkit);
      return pdf.embedFont(bytes, { subset: true });
    } catch { /* try the next installed font */ }
  }
  return pdf.embedFont(StandardFonts.Helvetica);
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

async function createClipPdf({ clipId, video, scenes, frameRowsByScene, storage }) {
  const pdf = await PDFDocument.create();
  const font = await loadChineseFont(pdf);
  const accent = rgb(0.18, 0.35, 0.29);
  const ink = rgb(0.12, 0.16, 0.19);
  for (const scene of scenes) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(0.96, 0.96, 0.94) });
    page.drawRectangle({ x: 0, y: PAGE.height - 12, width: PAGE.width, height: 12, color: accent });
    page.drawText(`游学纪 · 场景 ${scene.scene_index}`, { x: 42, y: PAGE.height - 68, size: 12, font, color: accent });
    page.drawText(scene.title, { x: 42, y: PAGE.height - 105, size: 25, font, color: ink });
    page.drawText(`${scene.start_sec.toFixed(1)}s – ${scene.end_sec.toFixed(1)}s`, { x: 42, y: PAGE.height - 128, size: 10, font, color: rgb(0.42, 0.45, 0.44) });
    page.drawText('学习观察', { x: 42, y: PAGE.height - 180, size: 11, font, color: accent });
    let textY = PAGE.height - 205;
    for (const line of wrapText(scene.summary, 34)) {
      page.drawText(line, { x: 42, y: textY, size: 12, font, color: ink });
      textY -= 19;
    }
    const frames = typeof frameRowsByScene.get === 'function' ? (frameRowsByScene.get(scene.id) || []) : (frameRowsByScene[scene.id] || []);
    const imageY = 142;
    const imageWidth = 158;
    const imageHeight = 190;
    for (let index = 0; index < Math.min(3, frames.length); index += 1) {
      const frame = frames[index];
      const x = 42 + index * 174;
      page.drawRectangle({ x, y: imageY, width: imageWidth, height: imageHeight, color: rgb(0.9, 0.92, 0.9) });
      await addImage(pdf, page, frame.path, x, imageY, imageWidth, imageHeight);
      page.drawText(`关键帧 ${index + 1} · ${frame.timestamp_sec.toFixed(1)}s`, { x, y: imageY - 18, size: 8, font, color: rgb(0.42, 0.45, 0.44) });
    }
    page.drawText('来自视频语音转写的学习线索', { x: 42, y: 86, size: 9, font, color: rgb(0.42, 0.45, 0.44) });
    for (const line of wrapText(scene.transcript, 75).slice(0, 2)) {
      page.drawText(line, { x: 42, y: 66, size: 8, font, color: rgb(0.35, 0.38, 0.37) });
    }
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
