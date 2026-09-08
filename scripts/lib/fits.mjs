/**
 * Minimal FITS BINTABLE reader (Node, no deps). Enough for catalogue files written by MWRFITS / astropy:
 *   primary header (no data) → extension header (XTENSION='BINTABLE') → row-major big-endian data.
 * Supported TFORM codes: L (logical), B (u8), I (i16), J (i32), K (i64 → Number), E (f32), D (f64), nA (ascii).
 * Header blocks are 2880 bytes of 80-char cards; data starts right after the header block that contains END.
 */

const BLOCK = 2880;
const CARD = 80;
const SIZES = { L: 1, B: 1, I: 2, J: 4, K: 8, E: 4, D: 8, A: 1, X: 0 };

/** Parse one header (sequence of 2880-byte blocks until END). Returns { cards, end } where end = data offset. */
export function readHeader(buf, off) {
  const cards = {};
  const order = [];
  for (let pos = off; ; pos += BLOCK) {
    if (pos + BLOCK > buf.length) throw new Error('FITS: header runs past end of file');
    const blk = buf.toString('latin1', pos, pos + BLOCK);
    for (let i = 0; i < BLOCK / CARD; i++) {
      const c = blk.slice(i * CARD, (i + 1) * CARD);
      const key = c.slice(0, 8).trim();
      if (key === 'END') return { cards, order, end: pos + BLOCK };
      if (!key || key === 'COMMENT' || key === 'HISTORY' || c[8] !== '=') continue;
      cards[key] = parseValue(c.slice(10));
      order.push(key);
    }
  }
}

function parseValue(s) {
  s = s.trimStart();
  if (s.startsWith("'")) {                       // quoted string ('' = escaped quote)
    let out = '', i = 1;
    for (; i < s.length; i++) {
      if (s[i] === "'") { if (s[i + 1] === "'") { out += "'"; i++; } else break; }
      else out += s[i];
    }
    return out.trimEnd();
  }
  const v = s.split('/')[0].trim();               // strip comment
  if (v === 'T') return true;
  if (v === 'F') return false;
  const n = Number(v.replace('D', 'E'));
  return Number.isFinite(n) ? n : v;
}

/** Byte size of the data unit that follows a header (padded to 2880). */
function dataSize(cards) {
  const naxis = cards.NAXIS ?? 0;
  if (!naxis) return 0;
  let n = Math.abs(cards.BITPIX) / 8;
  for (let i = 1; i <= naxis; i++) n *= cards[`NAXIS${i}`];
  n = n * (cards.GCOUNT ?? 1) + (cards.PCOUNT ?? 0);
  return Math.ceil(n / BLOCK) * BLOCK;
}

/**
 * Read a FITS file and return the first BINTABLE extension (or the `hdu`-th HDU, 1-based).
 * Result: { header, rows, rowBytes, columns: [{ name, form, code, count, offset, size, unit? }], column(name) }
 * `column(name)` decodes a whole column: Float64Array/Int32Array/… for numeric scalars, string[] for 'A', arrays for repeats.
 */
export function readBinTable(buf, hdu = 0) {
  let off = 0;
  let idx = 0;
  for (;;) {
    if (off >= buf.length) throw new Error('FITS: no BINTABLE extension found');
    const { cards, end } = readHeader(buf, off);
    const isTable = cards.XTENSION === 'BINTABLE';
    if ((hdu && idx === hdu) || (!hdu && isTable)) {
      if (!isTable) throw new Error(`FITS: HDU ${idx} is not a BINTABLE`);
      return makeTable(buf, cards, end);
    }
    off = end + dataSize(cards);
    idx++;
  }
}

function makeTable(buf, header, dataOff) {
  const rows = header.NAXIS2, rowBytes = header.NAXIS1, nf = header.TFIELDS;
  const columns = [];
  let offset = 0;
  for (let i = 1; i <= nf; i++) {
    const form = String(header[`TFORM${i}`] ?? '').trim();
    const m = /^(\d*)([LXBIJKAEDCMP])/.exec(form);
    if (!m) throw new Error(`FITS: unsupported TFORM${i} '${form}'`);
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const code = m[2];
    if (!(code in SIZES) || code === 'X') throw new Error(`FITS: unsupported column type '${code}' (TFORM${i})`);
    const size = SIZES[code] * count;
    columns.push({ name: String(header[`TTYPE${i}`] ?? `col${i}`).trim(), form, code, count, offset, size, unit: header[`TUNIT${i}`], tnull: header[`TNULL${i}`] });
    offset += size;
  }
  if (offset !== rowBytes) throw new Error(`FITS: TFORM sizes sum to ${offset} bytes but NAXIS1 = ${rowBytes}`);
  if (dataOff + rows * rowBytes > buf.length) throw new Error('FITS: data unit truncated');
  const byName = Object.fromEntries(columns.map((c) => [c.name, c]));

  const readScalar = (code, at) => {
    switch (code) {
      case 'E': return buf.readFloatBE(at);
      case 'D': return buf.readDoubleBE(at);
      case 'J': return buf.readInt32BE(at);
      case 'I': return buf.readInt16BE(at);
      case 'B': return buf.readUInt8(at);
      case 'K': return Number(buf.readBigInt64BE(at));
      case 'L': { const c = buf.readUInt8(at); return c === 84 ? true : c === 70 ? false : null; }
      default: throw new Error(`FITS: cannot read scalar of type ${code}`);
    }
  };

  function column(name) {
    const c = byName[name];
    if (!c) throw new Error(`FITS: no column '${name}' (have ${columns.map((x) => x.name).join(', ')})`);
    const base = dataOff + c.offset;
    if (c.code === 'A') {
      const out = new Array(rows);
      for (let r = 0; r < rows; r++) out[r] = buf.toString('latin1', base + r * rowBytes, base + r * rowBytes + c.count).replace(/\0/g, '').trim();
      return out;
    }
    if (c.count === 1) {
      const T = { E: Float32Array, D: Float64Array, J: Int32Array, I: Int16Array, B: Uint8Array, K: Float64Array, L: Array }[c.code];
      const out = T === Array ? new Array(rows) : new T(rows);
      for (let r = 0; r < rows; r++) out[r] = readScalar(c.code, base + r * rowBytes);
      return out;
    }
    const s = SIZES[c.code];
    const out = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const arr = new Array(c.count);
      for (let k = 0; k < c.count; k++) arr[k] = readScalar(c.code, base + r * rowBytes + k * s);
      out[r] = arr;
    }
    return out;
  }

  return { header, rows, rowBytes, columns, column };
}
