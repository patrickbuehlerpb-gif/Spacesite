/** Data loading with progress reporting and in-memory caching (shared across chapters). */

type Progress = (loaded: number, total: number, label: string) => void;
const listeners = new Set<Progress>();
const cache = new Map<string, Promise<unknown>>();

export function onLoadProgress(fn: Progress): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Absolute URL for a file inside public/data. */
export function dataUrl(rel: string): string {
  return `${import.meta.env.BASE_URL}data/${rel}`.replace(/\/{2,}/g, '/');
}
/** Absolute URL for a file inside public/textures. */
export function textureUrl(rel: string): string {
  return `${import.meta.env.BASE_URL}textures/${rel}`.replace(/\/{2,}/g, '/');
}

async function fetchWithProgress(url: string, label: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    listeners.forEach((l) => l(buf.byteLength, buf.byteLength, label));
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    listeners.forEach((l) => l(loaded, total, label));
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out.buffer;
}

/** Load (and cache) a binary file from public/data. */
export function loadBinary(rel: string, label = rel): Promise<ArrayBuffer> {
  const url = dataUrl(rel);
  let p = cache.get(url) as Promise<ArrayBuffer> | undefined;
  if (!p) { p = fetchWithProgress(url, label); cache.set(url, p); p.catch(() => cache.delete(url)); }
  return p;
}

/** Load (and cache) a JSON file from public/data. */
export function loadJSON<T>(rel: string, label = rel): Promise<T> {
  const url = dataUrl(rel);
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetchWithProgress(url, label).then((buf) => JSON.parse(new TextDecoder().decode(buf)) as T);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}
