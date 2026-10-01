export const LIMITS = Object.freeze({ files: 20, fileBytes: 20 * 1024 ** 2, batchBytes: 80 * 1024 ** 2, pixels: 16_000_000, batchPixels: 48_000_000, side: 16384, outputBytes: 32 * 1024 ** 2 });
export class SpecError extends Error { constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; } }
export function parseSettings(raw) {
  const amount = Number(raw.amount), unit = raw.unit;
  const minWidth = Number(raw.minWidth), minHeight = Number(raw.minHeight);
  const targetWidth = raw.targetWidth === '' ? null : Number(raw.targetWidth);
  const floor = Number(raw.floor);
  if (!['kB', 'KiB'].includes(unit) || !Number.isFinite(amount) || amount <= 0) throw new SpecError('settings');
  const maxBytes = Math.floor(amount * (unit === 'kB' ? 1000 : 1024));
  if (maxBytes < 1 || maxBytes > LIMITS.fileBytes) throw new SpecError('settings');
  for (const n of [minWidth, minHeight, ...(targetWidth === null ? [] : [targetWidth])]) {
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.side) throw new SpecError('settings');
  }
  if (!Number.isFinite(floor) || floor < 0.05 || floor > 1) throw new SpecError('settings');
  return { amount, unit, maxBytes, minWidth, minHeight, targetWidth, floor };
}
export function dimensions(width, height, settings) {
  if (width < settings.minWidth || height < settings.minHeight) throw new SpecError('sourceSmall');
  const outWidth = Math.min(width, settings.targetWidth ?? width);
  const outHeight = Math.max(1, Math.round(height * outWidth / width));
  if (outWidth < settings.minWidth || outHeight < settings.minHeight) throw new SpecError('targetSmall');
  return { width: outWidth, height: outHeight };
}
export function qualitySteps(floor) {
  const values = [];
  for (let n = 100; n >= Math.ceil(floor * 100); n -= 5) values.push(n / 100);
  if (!values.includes(floor)) values.push(floor);
  return values;
}
export async function findFittingEncode(encode, maxBytes, floor, check = () => {}) {
  const attempts = [];
  for (const quality of qualitySteps(floor)) {
    check();
    const blob = await encode(quality);
    check();
    if (!blob || blob.type !== 'image/jpeg') throw new SpecError('encode');
    attempts.push({ quality, bytes: blob.size });
    if (blob.size <= maxBytes) return { blob, quality, attempts };
  }
  return { blob: null, quality: null, attempts };
}
export function safeName(name, used) {
  let stem = name.replace(/\.[^.]*$/, '').normalize('NFKC').replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^[. ]+|[. ]+$/g, '') || 'image';
  stem = Array.from(stem).slice(0, 90).join('');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:$|\.)/i.test(stem)) stem = `_${stem}`;
  let candidate = `${stem}.jpg`, index = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${stem}-${index++}.jpg`;
  used.add(candidate.toLowerCase());
  return candidate;
}
export function checkFiles(files) {
  if (!files.length || files.length > LIMITS.files) throw new SpecError('fileCount');
  if (files.some(file => file.size > LIMITS.fileBytes)) throw new SpecError('fileSize');
  if (files.reduce((sum, file) => sum + file.size, 0) > LIMITS.batchBytes) throw new SpecError('batchSize');
}
const SOF = new Set([0xc0, 0xc1, 0xc2]);
function readOrientation(view, start, end) {
  if (end - start < 14 || view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return 1;
  const t = start + 6, byteOrder = view.getUint16(t), little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) throw new SpecError('jpeg');
  if (view.getUint16(t + 2, little) !== 42) throw new SpecError('jpeg');
  const dir = t + view.getUint32(t + 4, little);
  if (dir < t + 8 || dir + 2 > end) throw new SpecError('jpeg');
  const count = view.getUint16(dir, little);
  if (dir + 2 + count * 12 > end) throw new SpecError('jpeg');
  for (let n = 0; n < count; n++) {
    const p = dir + 2 + n * 12;
    if (view.getUint16(p, little) === 0x0112) {
      if (view.getUint16(p + 2, little) !== 3 || view.getUint32(p + 4, little) !== 1) throw new SpecError('jpeg');
      const value = view.getUint16(p + 8, little);
      if (value < 1 || value > 8) throw new SpecError('jpeg');
      return value;
    }
  }
  return 1;
}
// Inspect the bounded file before allocating pixels. APP1 is removed from the
// decode input so orientation is applied exactly once, under our control.
export function inspectJpeg(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) throw new SpecError('jpeg');
  let pos = 2, rawWidth, rawHeight, orientation = 1, orientationSeen = false;
  const remove = [];
  while (pos < bytes.length) {
    const start = pos;
    if (bytes[pos++] !== 0xff) throw new SpecError('jpeg');
    while (bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xda) {
      if (!rawWidth) throw new SpecError('jpeg');
      const swapped = orientation >= 5;
      return { rawWidth, rawHeight, orientation, width: swapped ? rawHeight : rawWidth, height: swapped ? rawWidth : rawHeight, remove };
    }
    if (marker === 0xd9 || marker === undefined || marker === 0x00 || marker === 0xd8) throw new SpecError('jpeg');
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > bytes.length) throw new SpecError('jpeg');
    const length = view.getUint16(pos), end = pos + length;
    if (length < 2 || end > bytes.length) throw new SpecError('jpeg');
    if (SOF.has(marker)) {
      if (rawWidth || length < 8 || bytes[pos + 2] !== 8) throw new SpecError('jpeg');
      rawHeight = view.getUint16(pos + 3); rawWidth = view.getUint16(pos + 5);
      if (!rawWidth || !rawHeight || rawWidth > LIMITS.side || rawHeight > LIMITS.side || rawWidth * rawHeight > LIMITS.pixels) throw new SpecError('pixels');
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) throw new SpecError('jpeg');
    if (marker === 0xe1) {
      if (end - pos >= 8 && view.getUint32(pos + 2) === 0x45786966) {
        if (orientationSeen) throw new SpecError('jpeg');
        orientation = readOrientation(view, pos + 2, end); orientationSeen = true;
      }
      remove.push([start, end]);
    }
    pos = end;
  }
  throw new SpecError('jpeg');
}
export function decodeBlob(buffer, info) {
  const bytes = new Uint8Array(buffer), parts = [];
  let start = 0;
  for (const [a, b] of info.remove) { parts.push(bytes.subarray(start, a)); start = b; }
  parts.push(bytes.subarray(start));
  return new Blob(parts, { type: 'image/jpeg' });
}
export function orientationMatrix(orientation, width, height) {
  return [null, [1,0,0,1,0,0], [-1,0,0,1,width,0], [-1,0,0,-1,width,height], [1,0,0,-1,0,height], [0,1,1,0,0,0], [0,1,-1,0,height,0], [0,-1,-1,0,height,width], [0,-1,1,0,0,width]][orientation];
}
export function makeReport(settings, results, cancelled = false) {
  return {
    application: 'SpecFit 0.1.0', createdAt: new Date().toISOString(), cancelled, settings,
    method: 'Fixed dimensions; quality 1.00 downward in 0.05 steps, plus the exact floor. Highest tested fitting quality, not a global optimum.',
    metadata: 'Original EXIF, GPS, IPTC, XMP and embedded profiles are not copied. Pixels are re-encoded by the browser; color appearance may differ.',
    files: results.map(({ file, info, output, name, status, code, attempts, quality }) => ({ source: file.name, sourceBytes: file.size, sourceDimensions: info ? { width: info.width, height: info.height } : null, status, reason: code || null, output: output ? { name, bytes: output.size, width: info.outputWidth, height: info.outputHeight, quality } : null, attempts: attempts || [] }))
  };
}
