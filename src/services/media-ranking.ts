import type { MediaUsage } from '@/types/media';

/** Bounded frequency plus a seven-day recency half-life. No message-history analysis. */
export function usageScore(item: MediaUsage, now: number) {
  const age = Math.max(0, now - Date.parse(item.last_used_at));
  return Math.log2(1 + item.use_count) * 3 + 4 * Math.pow(0.5, age / (7 * 86400000));
}
export function rankUsage(items: MediaUsage[], order: 'recent' | 'frequent', now = Date.now()) {
  return [...items].sort((a,b) => (order === 'recent' ? Date.parse(b.last_used_at) - Date.parse(a.last_used_at) : usageScore(b,now) - usageScore(a,now)) || a.media_id.localeCompare(b.media_id)).slice(0,24);
}
