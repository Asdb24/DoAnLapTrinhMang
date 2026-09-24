import type { GifMedia } from '@/types/media';

export interface GifProvider {
  search(query: string, offset: number, signal?: AbortSignal): Promise<{ items: GifMedia[]; next: number | null }>;
  byId(id: string, signal?: AbortSignal): Promise<GifMedia>;
}
export function validGifUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^media[0-4]?\.giphy\.com$/.test(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}
type ProviderGif = { id?: string; title?: string; rating?: string; images?: Record<string,{url?: string;width?: string;height?: string}> };
function normalize(item: ProviderGif): GifMedia | null {
  const media = item.images?.downsized || item.images?.original;
  const preview = item.images?.fixed_width_small || media;
  if (!item.id || !/^[A-Za-z0-9]{1,100}$/.test(item.id) || !['g','pg'].includes(item.rating || '') || !validGifUrl(media?.url) || !validGifUrl(preview?.url)) return null;
  const width = Number(media?.width), height = Number(media?.height);
  if (![width,height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)) return null;
  return {kind:'gif',provider:'giphy',id:item.id,title:(item.title || 'GIF').slice(0,200),mediaUrl:media!.url!,previewUrl:preview!.url!,width,height};
}
async function request(path: string, parameters: Record<string,string>, signal?: AbortSignal) {
  // GIPHY's browser API key is public by design; never place privileged provider credentials here.
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if (!key) throw new Error('GIF search is not configured yet. Ask your workspace administrator to enable GIPHY.');
  const url = new URL(`https://api.giphy.com/v1/gifs/${path}`);
  url.search = new URLSearchParams({...parameters,api_key:key,rating:'pg'}).toString();
  const response = await fetch(url,{signal,referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error(response.status === 429 ? 'GIF search is busy. Please try again shortly.' : 'GIF search is unavailable. Please retry.');
  return response.json();
}
/** GIPHY requires trending requests from the client; this adapter is replaceable. */
export const gifProvider: GifProvider = {
  async search(query, offset, signal) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 480) throw new Error('Invalid GIF page.');
    const result = await request(query.trim()?'search':'trending',{q:query.trim().slice(0,100),offset:String(offset),limit:'24'},signal);
    if (!Array.isArray(result.data)) throw new Error('GIF search returned an invalid response.');
    const items = result.data.map(normalize).filter((item: GifMedia|null): item is GifMedia => Boolean(item));
    const count = result.data.length;
    return {items,next:count===24 && offset+24 <= 480 && offset+24 < Number(result.pagination?.total_count || 0) ? offset+24 : null};
  },
  async byId(id, signal) {
    if (!/^[A-Za-z0-9]{1,100}$/.test(id)) throw new Error('Invalid GIF identifier.');
    const result = await request(id,{},signal), item = normalize(result.data || {});
    if (!item) throw new Error('This GIF is no longer available.');
    return item;
  },
};
