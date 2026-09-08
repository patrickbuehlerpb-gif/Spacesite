/**
 * Browser-side clients for live space data. All calls:
 *  - go through cachedFetch() (localStorage cache with TTL + in-flight dedupe + 12 s timeout),
 *  - return stale cached data when the network fails (and mark it `stale`),
 *  - throw LiveError only when nothing at all is available → UI shows t('ui.offline').
 *
 * CORS-checked sources (usable directly from the browser):
 *   ISS position ....... https://api.wheretheiss.at            (no key)
 *   Launches/astronauts  https://ll.thespacedevs.com/2.2.0      (no key, ~15 req/h → cache ≥ 30 min)
 *   Space weather ...... https://services.swpc.noaa.gov          (no key)
 *   NEOs / APOD ........ https://api.nasa.gov                    (DEMO_KEY: 30 req/h, 50/day → cache hard)
 *   Sun images ......... https://sdo.gsfc.nasa.gov/assets/img/latest/*.jpg (plain <img>)
 *   Earth live video ... Sen on YouTube (iframe)
 * NOT usable in the browser (no CORS): ssd-api.jpl.nasa.gov, api.open-notify.org (http only).
 */

export class LiveError extends Error {}

export interface Cached<T> { data: T; at: number; stale: boolean }
const inflight = new Map<string, Promise<unknown>>();
const MEM = new Map<string, { data: unknown; at: number }>();

function readCache<T>(key: string): { data: T; at: number } | null {
  const m = MEM.get(key);
  if (m) return m as { data: T; at: number };
  try {
    const raw = localStorage.getItem(`kosmos.live.${key}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as { data: T; at: number };
    MEM.set(key, v);
    return v;
  } catch { return null; }
}
function writeCache<T>(key: string, data: T): void {
  const v = { data, at: Date.now() };
  MEM.set(key, v);
  try { localStorage.setItem(`kosmos.live.${key}`, JSON.stringify(v)); } catch { /* quota / private mode */ }
}

export async function fetchJSON<T>(url: string, timeoutMs = 12000): Promise<T> {
  const ctl = new AbortController();
  const h = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new LiveError(`HTTP ${res.status} ${url}`);
    return (await res.json()) as T;
  } finally { clearTimeout(h); }
}

/**
 * Fetch with caching. `ttlMs` = how long a cached value is considered fresh.
 * On failure returns the stale cache (any age) if present, else throws LiveError.
 */
export async function cachedFetch<T>(key: string, url: string, ttlMs: number, transform?: (raw: unknown) => T): Promise<Cached<T>> {
  const c = readCache<T>(key);
  if (c && Date.now() - c.at < ttlMs) return { data: c.data, at: c.at, stale: false };
  let p = inflight.get(key) as Promise<Cached<T>> | undefined;
  if (!p) {
    p = (async () => {
      try {
        const raw = await fetchJSON<unknown>(url);
        const data = transform ? transform(raw) : (raw as T);
        writeCache(key, data);
        return { data, at: Date.now(), stale: false } as Cached<T>;
      } catch (e) {
        if (c) return { data: c.data, at: c.at, stale: true } as Cached<T>;
        throw e instanceof LiveError ? e : new LiveError(String(e));
      } finally { inflight.delete(key); }
    })();
    inflight.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// ISS
// ---------------------------------------------------------------------------------------------
export interface IssState {
  latitude: number; longitude: number; altitude: number; velocity: number;
  visibility: 'daylight' | 'eclipsed' | string; footprint: number; timestamp: number; solar_lat: number; solar_lon: number; units: string;
}
export const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
/** Current ISS state (km, km/h). Not cached beyond 2 s – it moves 7.66 km every second. */
export function fetchISS(): Promise<Cached<IssState>> { return cachedFetch<IssState>('iss', `${ISS_URL}?units=kilometers`, 2000); }
/** ISS positions at up to 10 unix timestamps (for ground track / prediction). */
export function fetchISSPositions(timestamps: number[]): Promise<IssState[]> {
  return fetchJSON<IssState[]>(`${ISS_URL}/positions?timestamps=${timestamps.slice(0, 10).join(',')}&units=kilometers`);
}
export interface Tle { line1: string; line2: string; header: string; requested_timestamp: number }
export function fetchISSTLE(): Promise<Cached<Tle>> { return cachedFetch<Tle>('iss-tle', `${ISS_URL}/tles`, 6 * 3600e3); }

// ---------------------------------------------------------------------------------------------
// Launch Library 2 (The Space Devs)
// ---------------------------------------------------------------------------------------------
export interface Launch {
  id: string; name: string; net: string; status: { abbrev: string; name: string; description?: string };
  provider: string; rocket: string; pad: string; location: string; countryCode: string;
  mission: { name: string; description: string; type: string; orbit: string } | null;
  image: string | null; webcast: boolean; vidUrl: string | null; url: string | null;
}
export const LL2 = 'https://ll.thespacedevs.com/2.2.0';
interface LL2Launch { id: string; name: string; net: string; status: { abbrev: string; name: string; description?: string }; launch_service_provider?: { name: string }; rocket?: { configuration?: { full_name?: string; name?: string } }; pad?: { name?: string; location?: { name?: string; country_code?: string } }; mission?: { name: string; description: string; type: string; orbit?: { name?: string } } | null; image?: string | null; webcast_live?: boolean; vidURLs?: Array<{ url: string; priority?: number }>; url?: string }
export function fetchUpcomingLaunches(limit = 10): Promise<Cached<Launch[]>> {
  return cachedFetch<Launch[]>(`launches-${limit}`, `${LL2}/launch/upcoming/?limit=${limit}&hide_recent_previous=true`, 30 * 60e3, (raw) => {
    const r = raw as { results: LL2Launch[] };
    return r.results.map((l) => ({
      id: l.id, name: l.name, net: l.net, status: l.status,
      provider: l.launch_service_provider?.name ?? '', rocket: l.rocket?.configuration?.full_name ?? l.rocket?.configuration?.name ?? '',
      pad: l.pad?.name ?? '', location: l.pad?.location?.name ?? '', countryCode: l.pad?.location?.country_code ?? '',
      mission: l.mission ? { name: l.mission.name, description: l.mission.description, type: l.mission.type, orbit: l.mission.orbit?.name ?? '' } : null,
      image: l.image ?? null, webcast: !!l.webcast_live, vidUrl: l.vidURLs?.[0]?.url ?? null, url: l.url ?? null,
    }));
  });
}

export interface Astronaut { id: number; name: string; agency: string; nationality: string; image: string | null; bio: string; flights: number; spacewalks: number; firstFlight: string | null; wiki: string | null; inSpace: boolean }
interface LL2Astronaut { id: number; name: string; agency?: { name?: string; abbrev?: string }; nationality?: string; profile_image_thumbnail?: string | null; profile_image?: string | null; bio?: string; flights_count?: number; spacewalks_count?: number; first_flight?: string | null; wiki?: string | null; in_space?: boolean }
export function fetchAstronautsInSpace(): Promise<Cached<Astronaut[]>> {
  return cachedFetch<Astronaut[]>('astronauts', `${LL2}/astronaut/?in_space=true&limit=100&ordering=name`, 60 * 60e3, (raw) => {
    const r = raw as { results: LL2Astronaut[] };
    return r.results.map((a) => ({
      id: a.id, name: a.name, agency: a.agency?.name ?? '', nationality: a.nationality ?? '', image: a.profile_image_thumbnail ?? a.profile_image ?? null,
      bio: a.bio ?? '', flights: a.flights_count ?? 0, spacewalks: a.spacewalks_count ?? 0, firstFlight: a.first_flight ?? null, wiki: a.wiki ?? null, inSpace: a.in_space ?? true,
    }));
  });
}

// ---------------------------------------------------------------------------------------------
// NOAA SWPC space weather
// ---------------------------------------------------------------------------------------------
export interface SpaceWeather {
  kp: number | null; kpTime: string | null;             // planetary K index (0–9)
  windSpeed: number | null; windDensity: number | null; windTime: string | null; // km/s, p/cm³
  bz: number | null; bt: number | null;                 // nT (IMF)
  flux107: number | null;                               // solar radio flux
  history: Array<{ t: string; kp: number }>;
}
export const SWPC = 'https://services.swpc.noaa.gov';
export async function fetchSpaceWeather(): Promise<Cached<SpaceWeather>> {
  const [kp, plasma, mag, f107] = await Promise.allSettled([
    cachedFetch<Array<{ time_tag: string; kp_index?: number; estimated_kp?: number; kp?: string }>>('swpc-kp', `${SWPC}/json/planetary_k_index_1m.json`, 10 * 60e3),
    cachedFetch<string[][]>('swpc-plasma', `${SWPC}/products/solar-wind/plasma-2-hour.json`, 10 * 60e3),
    cachedFetch<string[][]>('swpc-mag', `${SWPC}/products/solar-wind/mag-2-hour.json`, 10 * 60e3),
    cachedFetch<Array<{ time_tag: string; flux: number }>>('swpc-f107', `${SWPC}/json/f107_cm_flux.json`, 6 * 3600e3),
  ]);
  const out: SpaceWeather = { kp: null, kpTime: null, windSpeed: null, windDensity: null, windTime: null, bz: null, bt: null, flux107: null, history: [] };
  let stale = false, any = false, at = 0;
  if (kp.status === 'fulfilled') {
    any = true; stale ||= kp.value.stale; at = Math.max(at, kp.value.at);
    const arr = kp.value.data; const last = arr[arr.length - 1];
    if (last) { out.kp = last.estimated_kp ?? last.kp_index ?? null; out.kpTime = last.time_tag; }
    // one value per ~30 min for a sparkline of the last day
    out.history = arr.filter((_, i) => i % 30 === 0).map((r) => ({ t: r.time_tag, kp: r.estimated_kp ?? r.kp_index ?? 0 }));
  }
  if (plasma.status === 'fulfilled') {
    any = true; stale ||= plasma.value.stale; at = Math.max(at, plasma.value.at);
    const rows = plasma.value.data; // [["time_tag","density","speed","temperature"], ...]
    for (let i = rows.length - 1; i > 0; i--) { const r = rows[i]; if (r[2] && r[2] !== 'null') { out.windSpeed = Number(r[2]); out.windDensity = r[1] && r[1] !== 'null' ? Number(r[1]) : null; out.windTime = r[0]; break; } }
  }
  if (mag.status === 'fulfilled') {
    any = true; stale ||= mag.value.stale; at = Math.max(at, mag.value.at);
    const rows = mag.value.data; // [["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"], ...]
    for (let i = rows.length - 1; i > 0; i--) { const r = rows[i]; if (r[3] && r[3] !== 'null') { out.bz = Number(r[3]); out.bt = r[6] && r[6] !== 'null' ? Number(r[6]) : null; break; } }
  }
  if (f107.status === 'fulfilled') {
    any = true; const arr = f107.value.data; const last = arr[arr.length - 1]; if (last) out.flux107 = last.flux;
  }
  if (!any) throw new LiveError('space weather unavailable');
  return { data: out, at: at || Date.now(), stale };
}

/** Human labels for Kp. */
export function kpLevel(kp: number): { de: string; en: string; color: string } {
  if (kp < 4) return { de: 'ruhig', en: 'quiet', color: 'var(--green)' };
  if (kp < 5) return { de: 'unruhig', en: 'unsettled', color: 'var(--gold)' };
  if (kp < 6) return { de: 'kleiner Sturm (G1)', en: 'minor storm (G1)', color: 'var(--gold)' };
  if (kp < 7) return { de: 'mässiger Sturm (G2)', en: 'moderate storm (G2)', color: 'var(--rose)' };
  if (kp < 8) return { de: 'starker Sturm (G3)', en: 'strong storm (G3)', color: 'var(--rose)' };
  return { de: 'schwerer Sturm (G4+)', en: 'severe storm (G4+)', color: 'var(--rose)' };
}

// ---------------------------------------------------------------------------------------------
// NASA Open APIs (NeoWs, APOD)
// ---------------------------------------------------------------------------------------------
export const NASA = 'https://api.nasa.gov';
export function nasaKey(): string {
  try { return localStorage.getItem('kosmos.nasaKey') || 'DEMO_KEY'; } catch { return 'DEMO_KEY'; }
}
export function setNasaKey(k: string): void { try { if (k.trim()) localStorage.setItem('kosmos.nasaKey', k.trim()); else localStorage.removeItem('kosmos.nasaKey'); } catch { /* ignore */ } }

export interface Neo {
  id: string; name: string; hazardous: boolean; diameterMinM: number; diameterMaxM: number;
  approachTime: string; velocityKmS: number; missKm: number; missLunar: number; absMag: number; url: string;
}
interface NeoRaw { id: string; name: string; is_potentially_hazardous_asteroid: boolean; absolute_magnitude_h: number; nasa_jpl_url: string; estimated_diameter: { meters: { estimated_diameter_min: number; estimated_diameter_max: number } }; close_approach_data: Array<{ close_approach_date_full: string; epoch_date_close_approach: number; relative_velocity: { kilometers_per_second: string }; miss_distance: { kilometers: string; lunar: string } }> }
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
/** Close approaches from today for the next 7 days, sorted by time. */
export function fetchNeoFeed(): Promise<Cached<Neo[]>> {
  const start = new Date(); const end = new Date(Date.now() + 7 * 86400e3);
  const key = `neo-${isoDate(start)}`;
  return cachedFetch<Neo[]>(key, `${NASA}/neo/rest/v1/feed?start_date=${isoDate(start)}&end_date=${isoDate(end)}&api_key=${nasaKey()}`, 6 * 3600e3, (raw) => {
    const r = raw as { near_earth_objects: Record<string, NeoRaw[]> };
    const out: Neo[] = [];
    for (const day of Object.values(r.near_earth_objects)) for (const n of day) {
      const ca = n.close_approach_data[0]; if (!ca) continue;
      out.push({
        id: n.id, name: n.name.replace(/[()]/g, ''), hazardous: n.is_potentially_hazardous_asteroid,
        diameterMinM: n.estimated_diameter.meters.estimated_diameter_min, diameterMaxM: n.estimated_diameter.meters.estimated_diameter_max,
        approachTime: new Date(ca.epoch_date_close_approach).toISOString(), velocityKmS: Number(ca.relative_velocity.kilometers_per_second),
        missKm: Number(ca.miss_distance.kilometers), missLunar: Number(ca.miss_distance.lunar), absMag: n.absolute_magnitude_h, url: n.nasa_jpl_url,
      });
    }
    return out.sort((a, b) => a.approachTime.localeCompare(b.approachTime));
  });
}

export interface Apod { date: string; title: string; explanation: string; url: string; hdurl: string | null; mediaType: 'image' | 'video' | string; copyright: string | null }
export function fetchAPOD(): Promise<Cached<Apod>> {
  return cachedFetch<Apod>(`apod-${isoDate(new Date())}`, `${NASA}/planetary/apod?api_key=${nasaKey()}&thumbs=true`, 12 * 3600e3, (raw) => {
    const r = raw as { date: string; title: string; explanation: string; url: string; hdurl?: string; media_type: string; copyright?: string; thumbnail_url?: string };
    return { date: r.date, title: r.title, explanation: r.explanation, url: r.media_type === 'video' && r.thumbnail_url ? r.thumbnail_url : r.url, hdurl: r.hdurl ?? null, mediaType: r.media_type, copyright: r.copyright?.trim() ?? null };
  });
}

// ---------------------------------------------------------------------------------------------
// Static live resources
// ---------------------------------------------------------------------------------------------
/** Latest SDO images (refresh every ~15 min; append ?t= to bust caches). */
export const SDO_IMAGES = {
  aia171: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg',  // corona, 600'000 K
  aia304: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg',  // chromosphere, prominences
  aia193: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',  // hot corona, coronal holes
  hmi: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',    // visible light, sunspots
};
export function sdoUrl(k: keyof typeof SDO_IMAGES): string { return `${SDO_IMAGES[k]}?t=${Math.floor(Date.now() / (15 * 60e3))}`; }

/** Sen 4K Earth livestream (YouTube channel live embed). */
export const SEN_CHANNEL_ID = 'UCkvW_7kp9LJrztmgA4q4bJQ';
export const SEN_EMBED_URL = `https://www.youtube-nocookie.com/embed/live_stream?channel=${SEN_CHANNEL_ID}&autoplay=1&mute=1`;
export const SEN_URL = 'https://www.sen.com/live';
