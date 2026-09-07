const crypto = require('node:crypto');
const tls = require('node:tls');
const zlib = require('node:zlib');
const fs = require('node:fs/promises');

const HOST = 'openspeech.bytedance.com';
const PATH = '/api/v3/plan/sauc/bigmodel_async';
const RESOURCE_ID = 'volc.seedasr.sauc.duration';
const MP3_PACKET_BYTES = 1600; // 64kbps MP3 ~= 200ms.

function gzip(value) {
  return zlib.gzipSync(value);
}

function protocolPacket({ type, sequence, payload, final = false }) {
  const hasSequence = Number.isFinite(sequence);
  const flags = final ? 0x3 : hasSequence ? 0x1 : 0x0;
  const header = Buffer.from([0x11, (type << 4) | flags, 0x11, 0x00]);
  const compressed = gzip(payload);
  const parts = [header];
  if (hasSequence) {
    const sequenceBuffer = Buffer.alloc(4);
    sequenceBuffer.writeInt32BE(final ? -Math.abs(sequence) : sequence);
    parts.push(sequenceBuffer);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(compressed.length);
  parts.push(size, compressed);
  return Buffer.concat(parts);
}

function clientFrame(payload) {
  const mask = crypto.randomBytes(4);
  const length = payload.length;
  const head = length < 126
    ? Buffer.from([0x82, 0x80 | length])
    : length <= 0xffff
      ? Buffer.from([0x82, 0x80 | 126, length >> 8, length & 0xff])
      : (() => {
        const bytes = Buffer.alloc(10);
        bytes[0] = 0x82;
        bytes[1] = 0x80 | 127;
        bytes.writeBigUInt64BE(BigInt(length), 2);
        return bytes;
      })();
  const body = Buffer.from(payload);
  for (let index = 0; index < body.length; index += 1) body[index] ^= mask[index % 4];
  return Buffer.concat([head, mask, body]);
}

function parseFrames(buffer, onFrame) {
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (buffer.length - cursor < 2) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break;
      const bigLength = buffer.readBigUInt64BE(cursor);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('火山 ASR 返回帧过大');
      length = Number(bigLength);
      cursor += 8;
    }
    const masked = Boolean(second & 0x80);
    if (masked) {
      if (buffer.length - cursor < 4) break;
      cursor += 4;
    }
    if (buffer.length - cursor < length) break;
    onFrame({ opcode: first & 0x0f, payload: buffer.subarray(cursor, cursor + length) });
    offset = cursor + length;
  }
  return buffer.subarray(offset);
}

function parseServerPayload(message) {
  if (!message?.length || message.length < 8) return null;
  const headerSize = (message[0] & 0x0f) * 4;
  const messageType = message[1] >> 4;
  const flags = message[1] & 0x0f;
  const compressed = (message[2] & 0x0f) === 1;
  let offset = headerSize;
  if (flags === 1 || flags === 3) offset += 4;
  if (message.length - offset < 4) return null;
  const size = message.readUInt32BE(offset);
  offset += 4;
  if (message.length - offset < size) return null;
  const payload = message.subarray(offset, offset + size);
  const content = compressed ? zlib.gunzipSync(payload) : payload;
  if (messageType === 0x0f) {
    try {
      const error = JSON.parse(content.toString('utf8'));
      throw new Error(`火山 ASR 请求失败：${error.message || error.code || content.toString('utf8')}`);
    } catch (error) {
      if (String(error.message).startsWith('火山 ASR')) throw error;
      throw new Error(`火山 ASR 请求失败：${content.toString('utf8')}`);
    }
  }
  if (messageType !== 0x09) return null;
  return JSON.parse(content.toString('utf8'));
}

function collectUtterances(value, target) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectUtterances(item, target));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.utterances)) {
    for (const item of value.utterances) {
      const startTime = Number(item?.start_time);
      const endTime = Number(item?.end_time);
      const text = String(item?.text || '').trim();
      if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
      const key = `${startTime}:${endTime}`;
      const next = { start_time: startTime, end_time: endTime, text, definite: item.definite === true };
      const previous = target.get(key);
      if (!previous || next.definite || !previous.definite) target.set(key, next);
    }
  }
  Object.values(value).forEach((item) => collectUtterances(item, target));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connect(apiKey) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const socket = tls.connect(443, HOST, { servername: HOST });
    let handshake = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('火山 ASR WebSocket 连接超时'));
    }, 15000);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('secureConnect', () => {
      const key = crypto.randomBytes(16).toString('base64');
      socket.write([
        `GET ${PATH} HTTP/1.1`,
        `Host: ${HOST}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        `X-Api-Key: ${apiKey}`,
        `X-Api-Resource-Id: ${RESOURCE_ID}`,
        `X-Api-Request-Id: ${requestId}`,
        `X-Api-Connect-Id: ${requestId}`,
        'X-Api-Sequence: -1',
        '',
        '',
      ].join('\r\n'));
    });
    socket.on('data', (chunk) => {
      handshake = Buffer.concat([handshake, chunk]);
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = handshake.subarray(0, end).toString('utf8');
      const rest = handshake.subarray(end + 4);
      socket.removeAllListeners('data');
      clearTimeout(timer);
      if (!/^HTTP\/1\.1 101\b/m.test(head)) {
        socket.destroy();
        reject(new Error(`火山 ASR WebSocket 握手失败：${head.split('\r\n')[0] || '未知错误'}`));
        return;
      }
      resolve({ socket, initialData: rest, requestId, logId: (head.match(/\r?\nx-tt-logid:\s*([^\r\n]+)/i) || [])[1] || '' });
    });
  });
}

async function transcribeMp3WithVolcengine({ audioPath, apiKey, onProgress, timeOffsetMs = 0 }) {
  if (!apiKey) throw new Error('火山引擎语音模型密钥未配置');
  const audio = await fs.readFile(audioPath);
  if (!audio.length) throw new Error('待转录 MP3 为空');
  const { socket, initialData, requestId, logId } = await connect(apiKey);
  const utterancesByTime = new Map();
  let received = initialData;
  let remoteError = null;
  let lastResponseAt = Date.now();
  const process = () => {
    received = parseFrames(received, ({ opcode, payload }) => {
      if (opcode === 0x8) socket.end();
      if (opcode === 0x9) socket.write(Buffer.from([0x8a, 0x80, 0, 0, 0, 0]));
      if (opcode !== 0x2) return;
      try {
        const parsed = parseServerPayload(payload);
        if (parsed) {
          lastResponseAt = Date.now();
          collectUtterances(parsed, utterancesByTime);
        }
      } catch (error) {
        remoteError = error;
      }
    });
  };
  socket.on('data', (chunk) => {
    received = Buffer.concat([received, chunk]);
    process();
  });
  socket.on('error', (error) => { remoteError = error; });
  process();

  const request = {
    user: { uid: 'travel-study-electron' },
    audio: { format: 'mp3', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      enable_nonstream: true,
      show_utterances: true,
      result_type: 'single',
      end_window_size: 800,
    },
  };
  socket.write(clientFrame(protocolPacket({ type: 1, sequence: 1, payload: Buffer.from(JSON.stringify(request)) })));
  for (let offset = 0, sequence = 2; offset < audio.length; offset += MP3_PACKET_BYTES, sequence += 1) {
    if (remoteError) throw remoteError;
    const packet = audio.subarray(offset, Math.min(offset + MP3_PACKET_BYTES, audio.length));
    const final = offset + MP3_PACKET_BYTES >= audio.length;
    socket.write(clientFrame(protocolPacket({ type: 2, sequence, payload: packet, final })));
    onProgress?.(Math.min(0.9, 0.1 + (offset + packet.length) / audio.length * 0.8));
    if (!final) await wait(200);
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && Date.now() - lastResponseAt < 5000) {
    if (remoteError) throw remoteError;
    await wait(100);
  }
  socket.end();
  const utterances = [...utterancesByTime.values()]
    .filter((item) => item.definite)
    .sort((left, right) => left.start_time - right.start_time || left.end_time - right.end_time)
    .map(({ start_time, end_time, text }) => ({
      start_time: start_time + timeOffsetMs,
      end_time: end_time + timeOffsetMs,
      text,
    }));
  if (!utterances.length) throw new Error('火山 ASR 未返回最终分句结果');
  return {
    text: utterances.map((item) => item.text).join(''),
    utterances,
    provider: 'volcengine',
    model: 'doubao-seed-asr-2.0',
    resourceId: RESOURCE_ID,
    requestId,
    logId,
  };
}

module.exports = { RESOURCE_ID, transcribeMp3WithVolcengine };
