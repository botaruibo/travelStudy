const SUBTITLE_RULES = Object.freeze({
  minCueChars: 20,
  maxCharsPerLine: 16,
  maxLines: 2,
  maxCueDurationMs: 7000,
  mergeGapMs: 800,
});

const MAX_CUE_CHARS = SUBTITLE_RULES.maxCharsPerLine * SUBTITLE_RULES.maxLines;
const STRONG_BOUNDARY = new Set(['。', '！', '？', '；', '!', '?', ';']);
const WEAK_BOUNDARY = new Set(['，', '、', '：', ',', ':']);

function formatVttTime(milliseconds) {
  const value = Math.max(0, Math.round(Number(milliseconds) || 0));
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor(value / 60000) % 60;
  const seconds = Math.floor(value / 1000) % 60;
  const ms = value % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cueTextLength(value) {
  return Array.from(String(value || '').replace(/\n/g, '')).length;
}

function chooseBoundary(chars, target, min, max) {
  const lower = Math.max(1, min);
  const upper = Math.min(chars.length - 1, max);
  if (lower > upper) return Math.min(chars.length - 1, Math.max(1, target));
  const nearest = (matcher) => {
    let result = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = lower; index <= upper; index += 1) {
      if (!matcher(chars[index - 1])) continue;
      const nextDistance = Math.abs(index - target);
      if (nextDistance < distance || (nextDistance === distance && index > result)) {
        result = index;
        distance = nextDistance;
      }
    }
    return result;
  };
  return nearest((character) => STRONG_BOUNDARY.has(character))
    || nearest((character) => WEAK_BOUNDARY.has(character))
    || nearest((character) => /\s/.test(character))
    || Math.min(upper, Math.max(lower, target));
}

function splitText(text, parts) {
  const chars = Array.from(normalizeText(text));
  const count = Math.min(Math.max(1, Math.ceil(parts)), chars.length);
  const result = [];
  let remaining = chars;
  for (let index = 0; index < count - 1; index += 1) {
    const partsLeft = count - index;
    const target = Math.ceil(remaining.length / partsLeft);
    const min = Math.max(1, target - 8);
    const max = Math.min(MAX_CUE_CHARS, remaining.length - (partsLeft - 1), target + 8);
    const boundary = chooseBoundary(remaining, target, min, max);
    result.push(remaining.slice(0, boundary).join('').trim());
    remaining = remaining.slice(boundary);
  }
  if (remaining.length) result.push(remaining.join('').trim());
  return result.filter(Boolean);
}

function isSameOrContainedText(left, right) {
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeSourceUtterances(utterances) {
  const uniqueByTime = new Map();
  for (const item of Array.isArray(utterances) ? utterances : []) {
    const start = Number(item?.start_time);
    const end = Number(item?.end_time);
    const text = normalizeText(item?.text);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const key = `${start}:${end}`;
    const current = uniqueByTime.get(key);
    if (!current || cueTextLength(text) > cueTextLength(current.text)) {
      uniqueByTime.set(key, { start_time: start, end_time: end, text });
    }
  }
  const normalized = [];
  for (const item of [...uniqueByTime.values()].sort((left, right) => left.start_time - right.start_time || left.end_time - right.end_time)) {
    const previous = normalized[normalized.length - 1];
    const overlaps = previous && item.start_time <= previous.end_time + SUBTITLE_RULES.mergeGapMs;
    if (overlaps && isSameOrContainedText(previous.text, item.text)) {
      previous.start_time = Math.min(previous.start_time, item.start_time);
      previous.end_time = Math.max(previous.end_time, item.end_time);
      if (cueTextLength(item.text) > cueTextLength(previous.text)) previous.text = item.text;
      continue;
    }
    const start_time = previous ? Math.max(item.start_time, previous.end_time) : item.start_time;
    if (item.end_time <= start_time) continue;
    normalized.push({ ...item, start_time });
  }
  return normalized;
}

function splitUtterance(item) {
  const length = cueTextLength(item.text);
  const duration = item.end_time - item.start_time;
  const partCount = Math.max(
    Math.ceil(length / MAX_CUE_CHARS),
    Math.ceil(duration / SUBTITLE_RULES.maxCueDurationMs),
    1
  );
  const parts = splitText(item.text, partCount);
  let consumedChars = 0;
  return parts.map((text, index) => {
    consumedChars += cueTextLength(text);
    const end = index === parts.length - 1
      ? item.end_time
      : item.start_time + Math.round(duration * (consumedChars / length));
    const start = index === 0
      ? item.start_time
      : item.start_time + Math.round(duration * ((consumedChars - cueTextLength(text)) / length));
    return { start_time: start, end_time: end, text };
  });
}

function mergeShortCues(cues) {
  return cues.reduce((result, cue) => {
    const previous = result[result.length - 1];
    const mergedLength = previous ? cueTextLength(previous.text) + cueTextLength(cue.text) : 0;
    const gap = previous ? cue.start_time - previous.end_time : Number.POSITIVE_INFINITY;
    const mergedDuration = previous ? Math.max(previous.end_time, cue.end_time) - previous.start_time : 0;
    if (
      previous
      && cueTextLength(previous.text) < SUBTITLE_RULES.minCueChars
      && gap <= SUBTITLE_RULES.mergeGapMs
      && mergedLength <= MAX_CUE_CHARS
      && mergedDuration <= SUBTITLE_RULES.maxCueDurationMs
    ) {
      previous.end_time = Math.max(previous.end_time, cue.end_time);
      previous.text += cue.text;
      return result;
    }
    result.push({ ...cue });
    return result;
  }, []);
}

function wrapCueText(text) {
  const chars = Array.from(text);
  if (chars.length <= SUBTITLE_RULES.maxCharsPerLine) return text;
  const minFirstLine = Math.max(1, chars.length - SUBTITLE_RULES.maxCharsPerLine);
  const boundary = chooseBoundary(chars, Math.ceil(chars.length / 2), minFirstLine, SUBTITLE_RULES.maxCharsPerLine);
  return `${chars.slice(0, boundary).join('')}\n${chars.slice(boundary).join('')}`;
}

function normalizeSubtitleCues(utterances = []) {
  const split = normalizeSourceUtterances(utterances).flatMap(splitUtterance);
  return mergeShortCues(split).map((cue) => ({
    ...cue,
    text: wrapCueText(cue.text),
  }));
}

function toWebVtt(utterances = []) {
  const cues = normalizeSubtitleCues(utterances)
    .map((item, index) => `${index + 1}\n${formatVttTime(item.start_time)} --> ${formatVttTime(item.end_time)}\n${item.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${cues}${cues ? '\n' : ''}`;
}

module.exports = {
  SUBTITLE_RULES,
  cueTextLength,
  formatVttTime,
  normalizeSubtitleCues,
  toWebVtt,
};
