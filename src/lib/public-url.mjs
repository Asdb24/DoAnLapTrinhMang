/** One canonical application origin. Request Host headers are never trusted in production. */
export function resolveAppOrigin(value, mode, developmentOrigin) {
  const production = mode === 'production';
  const raw = value?.trim() || (!production ? developmentOrigin : undefined);
  if (!raw) throw new Error('Set NEXT_PUBLIC_APP_URL to the public HTTPS application URL.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('NEXT_PUBLIC_APP_URL must be an absolute URL.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('NEXT_PUBLIC_APP_URL must contain only the application origin, without credentials, path, query, or fragment.');
  }
  if (production && (url.protocol !== 'https:' || local)) {
    throw new Error('Production NEXT_PUBLIC_APP_URL must use a public HTTPS hostname.');
  }
  return url.origin;
}

export function appOrigin(developmentOrigin) {
  return resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV, developmentOrigin);
}
