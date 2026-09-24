"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMOJIS, EMOJI_CATEGORIES, DEFAULT_EMOJIS, SKIN_TONES, withTone, STICKERS, STICKER_PACKS } from '@/lib/media/catalog';
import { loadMediaUsage } from '@/services/media';
import { rankUsage } from '@/services/media-ranking';
import { gifProvider, validGifUrl } from '@/services/gifs';
import type { ChatMedia, GifMedia, MediaKind, MediaUsage } from '@/types/media';

export default function MediaPicker({userId,initialTab,onEmoji,onMedia}: {userId:string;initialTab:MediaKind;onEmoji:(emoji:string)=>void;onMedia:(media:ChatMedia)=>void}) {
  const [tab,setTab]=useState<MediaKind>(initialTab),[query,setQuery]=useState(''),[section,setSection]=useState('browse'),[category,setCategory]=useState('all'),[tone,setTone]=useState('0');
  const [usage,setUsage]=useState<MediaUsage[]>([]),[usageError,setUsageError]=useState('');
  const [gifs,setGifs]=useState<GifMedia[]>([]),[next,setNext]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const [preview,setPreview]=useState<ChatMedia|null>(null);
  const generation=useRef(0),abort=useRef<AbortController|null>(null);
  useEffect(()=>{
    let cancelled=false;setUsage([]);
    void loadMediaUsage(userId).then(rows=>{if(!cancelled)setUsage(rows);}).catch(()=>{if(!cancelled)setUsageError('Your recent items could not load. Reopen this panel to retry.');});
    return()=>{cancelled=true;};
  },[userId]);
  useEffect(()=>{
    const epoch=++generation.current;abort.current?.abort();setGifs([]);setError('');setNext(null);setBusy(false);
    if(tab!=='gif'||section!=='browse')return;
    const controller=new AbortController();abort.current=controller;
    const timer=setTimeout(()=>{setBusy(true);void gifProvider.search(query,0,controller.signal).then(page=>{if(epoch===generation.current){setGifs(page.items);setNext(page.next);}}).catch(cause=>{if(!controller.signal.aborted&&epoch===generation.current)setError(cause.message);}).finally(()=>{if(epoch===generation.current)setBusy(false);});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[tab,section,query,reload]);
  const more=async()=>{
    if(next===null||busy)return;const epoch=generation.current;setBusy(true);setError('');
    try{const page=await gifProvider.search(query,next,abort.current?.signal);if(epoch===generation.current){setGifs(old=>[...new Map([...old,...page.items].map(item=>[item.id,item])).values()]);setNext(page.next);}}
    catch(cause){if(epoch===generation.current)setError(cause instanceof Error?cause.message:'GIF search unavailable.');}
    finally{if(epoch===generation.current)setBusy(false);}
  };
  const personalized=rankUsage(usage.filter(item=>item.media_type===tab),section==='recent'?'recent':'frequent');
  const search=query.toLowerCase();
  const emojiValues=section==='browse'?EMOJIS.filter(item=>(category==='all'||item.category===category)&&(`${item.value} ${item.name}`).includes(search)).map(item=>({value:withTone(item,SKIN_TONES[Number(tone)]),name:item.name}))
    :(personalized.length?personalized.map(item=>item.media_id):DEFAULT_EMOJIS).map(value=>({value,name:EMOJIS.find(item=>item.value===value)?.name||value})).filter(item=>`${item.value} ${item.name}`.includes(search));
  const stickers=(section==='browse'?STICKERS:personalized.length?personalized.flatMap(item=>STICKERS.filter(sticker=>sticker.id===item.media_id)):STICKERS).filter(item=>`${item.name} ${item.keywords}`.toLowerCase().includes(search));
  const gifItems=section==='browse'?gifs:personalized.map(item=>item.metadata as GifMedia).filter(item=>item?.kind==='gif'&&validGifUrl(item.mediaUrl)&&validGifUrl(item.previewUrl)&&item.title.toLowerCase().includes(search));
  return <div className="space-y-3" aria-label="Chat media picker">
    <Tabs value={tab} onValueChange={value=>{setTab(value as MediaKind);setQuery('');setSection('browse');setPreview(null);}}>
      <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="emoji">Emoji</TabsTrigger><TabsTrigger value="gif">GIF</TabsTrigger><TabsTrigger value="sticker">Stickers</TabsTrigger></TabsList>
    </Tabs>
    <Input aria-label={`Search ${tab}`} placeholder={`Search ${tab==='sticker'?'stickers':tab}…`} value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="flex gap-1" aria-label="Media collections">{[['browse',tab==='gif'?'Discover':'Browse'],['recent','Recent'],['frequent','Frequently used']].map(([value,label])=><Button key={value} size="sm" variant={section===value?'secondary':'ghost'} aria-pressed={section===value} onClick={()=>{setSection(value);setPreview(null);}}>{label}</Button>)}</div>
    {usageError&&<p role="status" className="text-xs text-muted-foreground">{usageError}</p>}
    {tab==='emoji'&&<div className="flex gap-2"><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Emoji category"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{EMOJI_CATEGORIES.map(item=><SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Select value={tone} onValueChange={setTone}><SelectTrigger aria-label="Skin tone" className="w-28"><SelectValue/></SelectTrigger><SelectContent>{SKIN_TONES.map((value,index)=><SelectItem key={index} value={String(index)}>{index===0?'Default':`Tone ${index} ${value}`}</SelectItem>)}</SelectContent></Select></div>}
    {tab==='sticker'&&<p className="text-xs font-medium text-muted-foreground">{STICKER_PACKS[0].name} · Volume 1</p>}
    <ScrollArea className="h-64" onKeyDown={event=>{
      if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key))return;
      const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-media-item]'));
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;
      const step=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:event.key==='ArrowDown'?(tab==='emoji'?7:3):-(tab==='emoji'?7:3);
      event.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,index+step))]?.focus();
    }}>
      {tab==='emoji'&&<div className="grid grid-cols-7 gap-1 pr-3">{emojiValues.map(item=><Button key={item.value} data-media-item variant="ghost" className="h-10 p-0 text-2xl" title={item.name} aria-label={`${item.name} ${item.value}`} onClick={()=>onEmoji(item.value)}>{item.value}</Button>)}{!emojiValues.length&&<p className="col-span-7 text-sm text-muted-foreground">No matching emoji.</p>}</div>}
      {tab==='sticker'&&<div className="grid grid-cols-3 gap-2 pr-3">{stickers.map(item=><Button key={item.id} data-media-item variant="ghost" className="h-auto p-1" aria-label={item.name} onClick={()=>setPreview({kind:'sticker',id:item.id})}><img src={item.asset} alt={item.name} width={90} height={90} loading="lazy"/></Button>)}{!stickers.length&&<p className="col-span-3 text-sm text-muted-foreground">No matching stickers.</p>}</div>}
      {tab==='gif'&&<div className="grid grid-cols-3 gap-2 pr-3">{gifItems.map(item=><Button key={item.id} data-media-item variant="ghost" className="h-24 p-0 overflow-hidden" aria-label={`Preview ${item.title}`} onClick={()=>setPreview(item)}><img src={item.previewUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover"/></Button>)}{!busy&&!error&&!gifItems.length&&<p className="col-span-3 text-sm text-muted-foreground">{section==='browse'?'No matching GIFs.':'Send a GIF to build your personal collection.'}</p>}</div>}
      {busy&&<p role="status" className="py-4 text-center text-sm text-muted-foreground">Loading GIFs…</p>}
      {error&&<div role="alert" className="space-y-2 p-2 text-sm"><p>{error}</p><Button size="sm" variant="outline" onClick={()=>setReload(value=>value+1)}>Retry GIF search</Button></div>}
      {tab==='gif'&&section==='browse'&&next!==null&&!error&&<Button disabled={busy} variant="outline" className="mt-3 w-full" onClick={()=>void more()}>Load more GIFs</Button>}
    </ScrollArea>
    {preview&&<div className="flex items-center gap-3 border-t pt-3"><img alt={preview.kind==='gif'?preview.title:STICKERS.find(item=>item.id===preview.id)?.name||'Sticker'} src={preview.kind==='gif'?preview.previewUrl:STICKERS.find(item=>item.id===preview.id)?.asset} width={64} height={64} className="h-16 w-16 object-contain" referrerPolicy="no-referrer"/><Button className="flex-1" onClick={()=>onMedia(preview)}>Use {preview.kind==='gif'?'GIF':'sticker'}</Button><Button variant="ghost" aria-label="Cancel media preview" onClick={()=>setPreview(null)}>Cancel</Button></div>}
    {tab==='gif'&&<a href="https://giphy.com" target="_blank" rel="noreferrer" className="block text-right text-xs text-muted-foreground">Powered by GIPHY</a>}
  </div>;
}
