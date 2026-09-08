import { writeFileSync, readFileSync } from 'node:fs';

const SIZES = { f32: 4, u32: 4, u16: 2, u8: 1, i16: 2 };

/**
 * Write a KOSMOS binary catalogue (see src/data/bin.ts for the reader).
 * fields: [{ name, type, comps?, data: TypedArray }]
 */
export function writeCatalog(path, magic, count, fields, version = 1) {
  let size = 12;
  for (const f of fields) {
    const s = SIZES[f.type];
    if (size % s) size += s - (size % s);
    size += count * (f.comps ?? 1) * s;
    if (size % 4) size += 4 - (size % 4);
  }
  const buf = Buffer.alloc(size);
  buf.write(magic, 0, 'ascii');
  buf.writeUInt32LE(version, 4);
  buf.writeUInt32LE(count, 8);
  let off = 12;
  for (const f of fields) {
    const s = SIZES[f.type];
    if (off % s) off += s - (off % s);
    const n = count * (f.comps ?? 1);
    if (f.data.length !== n) throw new Error(`field ${f.name}: expected ${n} values, got ${f.data.length}`);
    for (let i = 0; i < n; i++) {
      const v = f.data[i];
      switch (f.type) {
        case 'f32': buf.writeFloatLE(v, off); break;
        case 'u32': buf.writeUInt32LE(v >>> 0, off); break;
        case 'u16': buf.writeUInt16LE(v & 0xffff, off); break;
        case 'i16': buf.writeInt16LE(v, off); break;
        case 'u8': buf.writeUInt8(v & 0xff, off); break;
      }
      off += s;
    }
    if (off % 4) off += 4 - (off % 4);
  }
  writeFileSync(path, buf);
  return size;
}

/** Read back a catalogue (for downstream build scripts / verification). */
export function readCatalog(path, magic, fields) {
  const b = readFileSync(path);
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const dv = new DataView(buf);
  const m = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m !== magic) throw new Error(`bad magic ${m}`);
  const count = dv.getUint32(8, true);
  let off = 12;
  const arrays = {};
  for (const f of fields) {
    const s = SIZES[f.type];
    if (off % s) off += s - (off % s);
    const n = count * (f.comps ?? 1);
    const C = { f32: Float32Array, u32: Uint32Array, u16: Uint16Array, i16: Int16Array, u8: Uint8Array }[f.type];
    arrays[f.name] = new C(buf, off, n);
    off += n * s;
    if (off % 4) off += 4 - (off % 4);
  }
  return { count, arrays };
}
