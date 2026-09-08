/**
 * Tiny binary catalogue format (little-endian):
 *   u32 magic (4 ASCII chars) · u32 version · u32 count · then the typed arrays listed in `fields`, in order.
 * Each field is `count * comps` elements of its type; u8 fields are padded to a multiple of 4 bytes.
 */
export type FieldType = 'f32' | 'u32' | 'u16' | 'u8' | 'i16';
export interface FieldSpec { name: string; type: FieldType; comps?: number }
export type Typed = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int16Array;

const SIZES: Record<FieldType, number> = { f32: 4, u32: 4, u16: 2, u8: 1, i16: 2 };

export function readCatalog(buf: ArrayBuffer, magic: string, fields: FieldSpec[]): { count: number; version: number; arrays: Record<string, Typed> } {
  const dv = new DataView(buf);
  const m = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m !== magic) throw new Error(`Bad catalogue magic: ${m} (expected ${magic})`);
  const version = dv.getUint32(4, true);
  const count = dv.getUint32(8, true);
  let off = 12;
  const arrays: Record<string, Typed> = {};
  for (const f of fields) {
    const n = count * (f.comps ?? 1);
    const size = SIZES[f.type];
    // align
    if (off % size !== 0) off += size - (off % size);
    let arr: Typed;
    switch (f.type) {
      case 'f32': arr = new Float32Array(buf, off, n); break;
      case 'u32': arr = new Uint32Array(buf, off, n); break;
      case 'u16': arr = new Uint16Array(buf, off, n); break;
      case 'i16': arr = new Int16Array(buf, off, n); break;
      case 'u8': arr = new Uint8Array(buf, off, n); break;
    }
    arrays[f.name] = arr;
    off += n * size;
    if (off % 4 !== 0) off += 4 - (off % 4);
  }
  return { count, version, arrays };
}
