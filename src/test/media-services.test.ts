import { afterEach, describe, expect, it, vi } from 'vitest';
import { gifProvider, validGifUrl } from '@/services/gifs';
import { rankUsage } from '@/services/media-ranking';
import type { MediaUsage } from '@/types/media';
afterEach(()=>vi.unstubAllEnvs());
describe('GIF provider boundary',()=>{
 const asset={id:'abc123',title:'Hello',rating:'pg',images:{downsized:{url:'https://media.giphy.com/media/abc123/giphy.gif',width:'200',height:'100'}}};
 it('searches paginated PG-rated results and exposes stable metadata',async()=>{
  vi.stubEnv('NEXT_PUBLIC_GIPHY_API_KEY','public-test-key');
  const fetcher=vi.fn(async(_url:URL,_options?:RequestInit)=>new Response(JSON.stringify({data:Array.from({length:24},()=>asset),pagination:{total_count:100}})));vi.stubGlobal('fetch',fetcher);
  const result=await gifProvider.search('hello & thanks',24);
  const url=new URL(String(fetcher.mock.calls[0][0]));
  expect(url.pathname).toBe('/v1/gifs/search');expect(url.searchParams.get('rating')).toBe('pg');expect(url.searchParams.get('q')).toBe('hello & thanks');expect(url.searchParams.get('offset')).toBe('24');
  expect(result.next).toBe(48);expect(result.items[0]).toMatchObject({kind:'gif',id:'abc123',provider:'giphy',width:200,height:100});
 });
 it('rejects unsafe media URLs and ratings instead of rendering arbitrary provider HTML',async()=>{
  vi.stubEnv('NEXT_PUBLIC_GIPHY_API_KEY','public-test-key');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({data:[{...asset,rating:'r'},{...asset,images:{downsized:{url:'https://evil.example/a.gif',width:'2',height:'2'}}}],pagination:{total_count:2}}))));
  expect((await gifProvider.search('',0)).items).toEqual([]);
  expect(validGifUrl('https://media.giphy.com.evil.example/file')).toBe(false);
  expect(validGifUrl('https://secret@media.giphy.com/file')).toBe(false);
 });
 it('reports absent configuration and provider failure without silent fallback',async()=>{
  vi.stubEnv('NEXT_PUBLIC_GIPHY_API_KEY','');await expect(gifProvider.search('',0)).rejects.toThrow('not configured');
  vi.stubEnv('NEXT_PUBLIC_GIPHY_API_KEY','public-test-key');vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:429})));
  await expect(gifProvider.search('',0)).rejects.toThrow('busy');
 });
});
describe('personalized ranking',()=>{
 it('balances repeat use and recent use deterministically without mutating input',()=>{
  const now=Date.parse('2026-09-23T00:00:00Z');
  const item=(id:string,count:number,age:number):MediaUsage=>({user_id:'a',media_type:'emoji',media_id:id,use_count:count,last_used_at:new Date(now-age*86400000).toISOString(),metadata:{}});
  const items=[item('old',1,100),item('regular',20,1),item('new',1,0)];
  expect(rankUsage(items,'frequent',now).map(x=>x.media_id)).toEqual(['regular','new','old']);
  expect(rankUsage(items,'recent',now).map(x=>x.media_id)).toEqual(['new','regular','old']);expect(items[0].media_id).toBe('old');
 });
});


describe('emoji usage hints',()=>{
 it('keeps unsupported Unicode in text while omitting SQL-incompatible hints',async()=>{
  const {usedEmojis}=await import('@/services/media');
  const england=String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0065,0xe006e,0xe0067,0xe007f);
  const text='English tiếng Việt 中文 ↔️ '+england+' 👍🏽 👩‍💻 ❤️ 🇻🇳 1️⃣ 👍🏽';
  expect(usedEmojis(text)).toEqual(['👍🏽','👩‍💻','❤️','🇻🇳','1️⃣']);
  expect(text).toContain(england);
  expect(usedEmojis('text 123 https://example.com '+String.fromCodePoint(0x1f3fb)+' 😀'+String.fromCodePoint(0x301))).toEqual([]);
 });
 it('deduplicates and caps compatible hints at 64 without splitting clusters',async()=>{
  const {usedEmojis}=await import('@/services/media');
  const emojis=Array.from({length:80},(_,i)=>String.fromCodePoint(0x1f600+i));
  const result=usedEmojis(emojis.join(' ')+' '+emojis.join(' '));
  expect(result).toEqual(emojis.slice(0,64));
 });
});
