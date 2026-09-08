#!/usr/bin/env node
/**
 * Headless screenshot + smoke test for a chapter route.
 *
 *   node scripts/shot.mjs "#/sterne" shots/stars.png [--w 1440] [--h 900] [--wait 2500]
 *        [--click "css"]... [--key Enter]... [--eval "js"]... [--lang de|en] [--mobile] [--fps] [--mock]
 *
 *   --mock  serves fixtures from scripts/mock/ for the live APIs (ISS, launches, NOAA, NASA, SDO, YouTube)
 *           so the Live/Home chapters can be tested without internet.
 *
 * Starts an in-process Vite dev server on a random port, opens Chromium with software WebGL,
 * waits for window.__kosmos.ready, runs optional actions, waits, screenshots. Exits 1 when the page
 * logged uncaught errors or the chapter never became ready. Prints console errors/warnings.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const route = args[0] ?? '#/';
const out = args[1] ?? 'shots/shot.png';
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const all = (name) => args.map((a, i) => (a === `--${name}` ? args[i + 1] : null)).filter(Boolean);
const W = Number(opt('w', flag('mobile') ? 390 : 1440));
const H = Number(opt('h', flag('mobile') ? 844 : 900));
const WAIT = Number(opt('wait', 1500));
const LANG = opt('lang', 'de');

mkdirSync(dirname(resolve(out)), { recursive: true });
const server = await createServer({ root: resolve(dirname(new URL(import.meta.url).pathname), '..'), server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const url = `http://127.0.0.1:${port}/${route.startsWith('#') ? route : `#/${route}`}`;

const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: LANG === 'de' ? 'de-CH' : 'en-US', isMobile: flag('mobile'), hasTouch: flag('mobile') });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => { if (!/youtube|googlevideo/.test(r.url())) logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`); });
await page.addInitScript((l) => { try { localStorage.setItem('kosmos.lang', l); } catch {} }, LANG);
if (flag('mock')) await installMocks(page);

let ok = true;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__kosmos && window.__kosmos.ready, null, { timeout: 60000 });
  for (const sel of all('click')) { await page.click(sel, { timeout: 5000 }); await page.waitForTimeout(400); }
  for (const key of all('key')) { await page.keyboard.press(key); await page.waitForTimeout(200); }
  for (const js of all('eval')) { const r = await page.evaluate(js); if (r !== undefined) console.log('[eval]', JSON.stringify(r)); }
  await page.waitForTimeout(WAIT);
  if (flag('fps')) {
    const f0 = await page.evaluate(() => window.__kosmos.frames);
    await page.waitForTimeout(2000);
    const f1 = await page.evaluate(() => window.__kosmos.frames);
    console.log(`[fps] ~${((f1 - f0) / 2).toFixed(1)} fps (software WebGL – real GPUs are much faster)`);
  }
  await page.screenshot({ path: out, fullPage: false });
  const k = await page.evaluate(() => window.__kosmos);
  console.log(`[shot] ${out}  chapter=${k.chapter} frames=${k.frames}`);
  if (k.errors.length) { ok = false; console.log('[kosmos.errors]', k.errors); }
} catch (e) {
  ok = false;
  console.log('[shot] FAILED:', e.message);
  try { await page.screenshot({ path: out }); } catch {}
}
for (const l of logs) console.log(l);
if (logs.some((l) => l.startsWith('[pageerror]') || l.startsWith('[console.error]'))) ok = false;
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);

// ---------------------------------------------------------------------------------------------
async function installMocks(page) {
  const here = dirname(new URL(import.meta.url).pathname);
  const fx = (n) => readFileSync(resolve(here, 'mock', n));
  const json = (route, n) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fx(n) });
  const img = (route, r, g, b) => route.fulfill({ status: 200, contentType: 'image/png', body: solidPng(64, 64, r, g, b) });
  await page.route(/api\.wheretheiss\.at\/v1\/satellites\/25544\/positions/, (r) => json(r, 'iss-positions.json'));
  await page.route(/api\.wheretheiss\.at\/v1\/satellites\/25544\/tles/, (r) => json(r, 'iss-tle.json'));
  await page.route(/api\.wheretheiss\.at\/v1\/satellites\/25544/, (r) => json(r, 'iss.json'));
  await page.route(/ll\.thespacedevs\.com\/.*\/launch\//, (r) => json(r, 'launches.json'));
  await page.route(/ll\.thespacedevs\.com\/.*\/astronaut\//, (r) => json(r, 'astronauts.json'));
  await page.route(/services\.swpc\.noaa\.gov\/json\/planetary_k_index_1m\.json/, (r) => json(r, 'swpc-kp.json'));
  await page.route(/services\.swpc\.noaa\.gov\/products\/solar-wind\/plasma/, (r) => json(r, 'swpc-plasma.json'));
  await page.route(/services\.swpc\.noaa\.gov\/products\/solar-wind\/mag/, (r) => json(r, 'swpc-mag.json'));
  await page.route(/services\.swpc\.noaa\.gov\/json\/f107_cm_flux\.json/, (r) => json(r, 'swpc-f107.json'));
  await page.route(/api\.nasa\.gov\/neo\//, (r) => json(r, 'neo.json'));
  await page.route(/api\.nasa\.gov\/planetary\/apod/, (r) => json(r, 'apod.json'));
  await page.route(/sdo\.gsfc\.nasa\.gov\/.*\.jpg/, (r) => img(r, 230, 120, 20));
  await page.route(/apod\.nasa\.gov\/.*\.(jpg|png)/, (r) => img(r, 40, 30, 90));
  await page.route(/thespacedevs-prod.*\.(jpe?g|png)/, (r) => img(r, 60, 60, 70));
  await page.route(/youtube(-nocookie)?\.com\/embed/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<body style="background:#111;color:#888;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">▶ video (mock)</body>' }));
}

/** Minimal solid-colour PNG encoder (no deps). */
function solidPng(w, h, r, g, b) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
