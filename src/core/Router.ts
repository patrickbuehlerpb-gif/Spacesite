/** Hash router: `#/sterne`, `#/sterne/betelgeuse`. Empty hash = home. */
export interface Route { path: string; param?: string }

export function parseHash(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path = '', ...rest] = h.split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  return { path, param };
}

export function navigate(path: string, param?: string): void {
  const target = `#/${path}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function onRoute(fn: (r: Route) => void): () => void {
  const h = () => fn(parseHash());
  window.addEventListener('hashchange', h);
  return () => window.removeEventListener('hashchange', h);
}
