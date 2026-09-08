import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');
export const RAW = process.env.RAW_DIR ?? resolve(ROOT, 'raw');
export const OUT = resolve(ROOT, 'public', 'data');

/** Ensure a raw source file exists locally (download from `url` if missing). Returns the path. */
export async function ensureRaw(name, url) {
  mkdirSync(RAW, { recursive: true });
  const p = resolve(RAW, name);
  if (existsSync(p)) return p;
  if (!url) throw new Error(`Missing raw file ${p} and no download URL given`);
  console.log(`[raw] downloading ${url} → ${p}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields with commas). */
export function parseCSV(text, sep = ',') {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
