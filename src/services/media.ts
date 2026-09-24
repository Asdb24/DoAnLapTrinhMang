import { getSupabase } from '@/lib/supabase/client';
import type { MediaUsage } from '@/types/media';
import { check } from './workspace';

export async function loadMediaUsage(userId: string): Promise<MediaUsage[]> {
  // Both query scope and database RLS isolate preferences by authenticated user.
  const results=await Promise.all(['emoji','gif','sticker'].map(type=>getSupabase().from('media_usage').select('*').eq('user_id',userId).eq('type',type).order('last_used_at',{ascending:false}).limit(500)));
  const rows=results.flatMap(result=>check(result));
  return rows.map(row=>({...row,media_type:row.type})) as MediaUsage[];
}
// Keep usage hints within chat_private.valid_emoji's contract. Unsupported Unicode
// remains message content; it simply does not participate in personalization.
function validEmojiHint(value: string) {
  const points = Array.from(value, char => char.codePointAt(0)!);
  if (!points.length || points.length > 32 || new TextEncoder().encode(value).length > 128) return false;
  if (/^[#*0-9]\uFE0F?\u20E3$/u.test(value)) return true;
  let base = false;
  for (const [index, cp] of points.entries()) {
    if ([8205, 65038, 65039].includes(cp) || (cp >= 127995 && cp <= 127999)) {
      if (index === 0) return false;
    } else if ((cp >= 127744 && cp <= 129791) || (cp >= 127462 && cp <= 127487)
      || (cp >= 9728 && cp <= 10175) || (cp >= 9193 && cp <= 9203) || (cp >= 9208 && cp <= 9210)
      || (cp >= 11013 && cp <= 11015) || (cp >= 11035 && cp <= 11036)
      || [169,174,8252,8265,8482,8505,8986,8987,9000,9167,9410,11088,11093,12336,12349,12951,12953].includes(cp)) {
      base = true;
    } else return false;
  }
  return base && points.at(-1) !== 8205;
}
export function usedEmojis(text: string) {
  const segments = new Intl.Segmenter('en', {granularity:'grapheme'}).segment(text);
  return [...new Set(Array.from(segments, part=>part.segment).filter(value=>/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value) && validEmojiHint(value)))].slice(0,64);
}
