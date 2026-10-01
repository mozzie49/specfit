const encoder = new TextEncoder();
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
// Small ZIP32 writer using STORE: JPEG is already compressed. No zip library,
// filename paths, ZIP64, encryption, or decompression of untrusted archives.
export async function makeZip(entries, check = () => {}) {
  if (entries.length > 100) throw new Error('Too many ZIP entries');
  const parts = [], directory = [];
  let offset = 0, centralBytes = 0;
  for (const entry of entries) {
    check();
    if (!entry.name || /[\\/\x00]/.test(entry.name) || entry.name === '.' || entry.name === '..') throw new Error('Unsafe ZIP name');
    const name = encoder.encode(entry.name), data = new Uint8Array(await entry.blob.arrayBuffer());
    check();
    if (name.length > 65535 || offset + data.length > 64 * 1024 ** 2) throw new Error('ZIP size limit');
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true); // 1980-01-01; reproducible archive header
    l.setUint32(14, checksum, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true); c.setUint32(16, checksum, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
    parts.push(local, data); directory.push(central); offset += local.length + data.length; centralBytes += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, centralBytes, true); e.setUint32(16, offset, true);
  check();
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}
