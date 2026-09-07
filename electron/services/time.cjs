const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

function toChinaTimeString(input = Date.now()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + CHINA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  const hours = pad(shifted.getUTCHours());
  const minutes = pad(shifted.getUTCMinutes());
  const seconds = pad(shifted.getUTCSeconds());
  const milliseconds = pad(shifted.getUTCMilliseconds(), 3);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`;
}

function nowInChina() {
  return toChinaTimeString(new Date());
}

function normalizeChinaTimestamp(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value === 'number') return toChinaTimeString(value);
  if (typeof value === 'string') {
    if (/[+-]08:00$/.test(value)) return value;
    if (/^\d+(\.\d+)?$/.test(value.trim())) return toChinaTimeString(Number(value.trim()));
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return toChinaTimeString(parsed);
    return value;
  }
  if (value instanceof Date) return toChinaTimeString(value);
  return value;
}

module.exports = { nowInChina, toChinaTimeString, normalizeChinaTimestamp };
