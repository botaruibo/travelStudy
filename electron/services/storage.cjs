const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function compressedVideoFileName(value, fallbackId) {
  const sourceName = path.basename(String(value || ''));
  const baseName = path.parse(sourceName).name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return `${baseName || safeSegment(fallbackId) || 'video'}.mp4`;
}

class StorageService {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.paths = {
      proxy: path.join(rootPath, 'media', 'small-video'),
      audio: path.join(rootPath, 'media', 'audio'),
      frames: path.join(rootPath, 'media', 'frames'),
      clips: path.join(rootPath, 'pdf-notes', 'fragments'),
      notes: path.join(rootPath, 'pdf-notes', 'notes'),
      transcripts: path.join(rootPath, 'media', 'transcripts'),
      subtitles: path.join(rootPath, 'media', 'subtitles'),
      templates: path.join(rootPath, 'templates'),
    };
    this.legacyPaths = {
      proxy: path.join(rootPath, 'media', 'proxy'),
      transcripts: path.join(rootPath, 'analysis', 'transcripts'),
      subtitles: path.join(rootPath, 'analysis', 'subtitles'),
      outputs: path.join(rootPath, 'outputs'),
      analysis: path.join(rootPath, 'analysis'),
    };
  }

  async init({ db } = {}) {
    await Promise.all(Object.values(this.paths).map((folder) => fsp.mkdir(folder, { recursive: true })));
    await this.migrateLegacyLayout(db);
    return this;
  }

  async moveDirectoryContents(source, target) {
    if (!fs.existsSync(source)) return;
    await fsp.mkdir(target, { recursive: true });
    for (const entry of await fsp.readdir(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await this.moveDirectoryContents(from, to);
        await fsp.rm(from, { recursive: true, force: true });
      } else {
        if (!fs.existsSync(to)) {
          await fsp.rename(from, to);
          continue;
        }
        const sourceStat = await fsp.stat(from);
        const targetStat = await fsp.stat(to);
        if (targetStat.size === sourceStat.size) {
          await fsp.rm(from, { force: true });
          continue;
        }
        const parsed = path.parse(to);
        let duplicate = path.join(parsed.dir, `${parsed.name}.legacy${parsed.ext}`);
        let suffix = 2;
        while (fs.existsSync(duplicate)) {
          duplicate = path.join(parsed.dir, `${parsed.name}.legacy-${suffix}${parsed.ext}`);
          suffix += 1;
        }
        await fsp.rename(from, duplicate);
      }
    }
  }

  replacePath(value, migrations) {
    if (typeof value === 'string') {
      for (const [from, to] of migrations) {
        if (value === from || value.startsWith(`${from}${path.sep}`)) return `${to}${value.slice(from.length)}`;
      }
      return value
        .replace(/\/media\/proxy(?=\/|$)/g, '/media/small-video')
        .replace(/\/analysis\/transcripts(?=\/|$)/g, '/media/transcripts')
        .replace(/\/analysis\/subtitles(?=\/|$)/g, '/media/subtitles')
        .replace(/\/outputs(?=\/|$)/g, '/pdf-notes');
    }
    if (Array.isArray(value)) return value.map((item) => this.replacePath(item, migrations));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.replacePath(item, migrations)]));
    }
    return value;
  }

  migrateDatabasePaths(db, migrations) {
    if (!db) return;
    const fields = [
      ['videos', 'id', ['source_path', 'proxy_path', 'audio_path', 'transcript_path', 'subtitle_path']],
      ['keyframes', 'id', ['path']],
      ['clips', 'id', ['path']],
      ['notes', 'id', ['path']],
    ];
    for (const [table, idColumn, columns] of fields) {
      for (const row of db.all(`SELECT ${idColumn}, ${columns.join(', ')} FROM ${table}`)) {
        const updates = [];
        const params = [];
        for (const column of columns) {
          const next = this.replacePath(row[column], migrations);
          if (next !== row[column]) {
            updates.push(`${column} = ?`);
            params.push(next);
          }
        }
        if (updates.length) db.run(`UPDATE ${table} SET ${updates.join(', ')} WHERE ${idColumn} = ?`, [...params, row[idColumn]]);
      }
    }
    for (const row of db.all('SELECT id, metadata_json FROM tasks')) {
      try {
        const metadata = JSON.parse(row.metadata_json || '{}');
        const next = this.replacePath(metadata, migrations);
        const json = JSON.stringify(next);
        if (json !== row.metadata_json) db.run('UPDATE tasks SET metadata_json = ? WHERE id = ?', [json, row.id]);
      } catch {
        // Preserve malformed task metadata rather than risking data loss during migration.
      }
    }
  }

  async migrateLegacyLayout(db) {
    const migrations = [
      [this.legacyPaths.proxy, this.paths.proxy],
      [this.legacyPaths.transcripts, this.paths.transcripts],
      [this.legacyPaths.subtitles, this.paths.subtitles],
      [this.legacyPaths.outputs, path.join(this.rootPath, 'pdf-notes')],
    ];
    await this.moveDirectoryContents(this.legacyPaths.proxy, this.paths.proxy);
    await this.moveDirectoryContents(this.legacyPaths.transcripts, this.paths.transcripts);
    await this.moveDirectoryContents(this.legacyPaths.subtitles, this.paths.subtitles);
    await this.moveDirectoryContents(this.legacyPaths.outputs, path.join(this.rootPath, 'pdf-notes'));
    this.migrateDatabasePaths(db, migrations);
    await Promise.all([
      fsp.rm(this.legacyPaths.analysis, { recursive: true, force: true }),
      fsp.rm(this.legacyPaths.outputs, { recursive: true, force: true }),
      fsp.rm(this.legacyPaths.proxy, { recursive: true, force: true }),
    ]);
  }

  compressedVideoFileName(name, fallbackId) { return compressedVideoFileName(name, fallbackId); }
  proxyPath(fileName, fallbackId) { return path.join(this.paths.proxy, compressedVideoFileName(fileName, fallbackId)); }
  legacyProxyPath(videoId) { return path.join(this.paths.proxy, `${safeSegment(videoId)}.mp4`); }
  audioPath(videoId) { return path.join(this.paths.audio, `${safeSegment(videoId)}.mp3`); }
  transcriptPath(videoId) { return path.join(this.paths.transcripts, `${safeSegment(videoId)}.txt`); }
  subtitlePath(videoId) { return path.join(this.paths.subtitles, `${safeSegment(videoId)}.vtt`); }
  transcriptionCheckpointPath(videoId) { return path.join(this.paths.transcripts, `${safeSegment(videoId)}.checkpoint.json`); }
  transcriptionSegmentPath(videoId, segmentIndex) { return path.join(this.paths.audio, `${safeSegment(videoId)}.segment-${segmentIndex}.mp3`); }
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
