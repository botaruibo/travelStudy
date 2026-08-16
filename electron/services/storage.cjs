const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

class StorageService {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.paths = {
      proxy: path.join(rootPath, 'media', 'proxy'),
      audio: path.join(rootPath, 'media', 'audio'),
      frames: path.join(rootPath, 'media', 'frames'),
      clips: path.join(rootPath, 'outputs', 'fragments'),
      notes: path.join(rootPath, 'outputs', 'notes'),
      transcripts: path.join(rootPath, 'analysis', 'transcripts'),
    };
  }

  async init() {
    await Promise.all(Object.values(this.paths).map((folder) => fsp.mkdir(folder, { recursive: true })));
    return this;
  }

  proxyPath(videoId) { return path.join(this.paths.proxy, `${safeSegment(videoId)}.mp4`); }
  audioPath(videoId) { return path.join(this.paths.audio, `${safeSegment(videoId)}.mp3`); }
  transcriptPath(videoId) { return path.join(this.paths.transcripts, `${safeSegment(videoId)}.txt`); }
  framePath(videoId, sceneIndex, frameIndex) {
    const folder = path.join(this.paths.frames, safeSegment(videoId), `scene-${sceneIndex}`);
    return { folder, file: path.join(folder, `frame-${frameIndex}.jpg`) };
  }
  clipPath(clipId) { return path.join(this.paths.clips, `${safeSegment(clipId)}.pdf`); }
  notePath(noteId) { return path.join(this.paths.notes, `${safeSegment(noteId)}.pdf`); }

  async ensureParent(filePath) { await fsp.mkdir(path.dirname(filePath), { recursive: true }); }
  async fileExists(filePath) { try { await fsp.access(filePath, fs.constants.F_OK); return true; } catch { return false; } }
  async remove(filePath) { if (await this.fileExists(filePath)) await fsp.rm(filePath, { force: true }); }
}

module.exports = { StorageService, safeSegment };
