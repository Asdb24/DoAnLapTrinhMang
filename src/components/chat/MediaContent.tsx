"use client";
import { useState } from 'react';
import type { ChatMedia } from '@/types/media';
import { STICKERS } from '@/lib/media/catalog';
import { gifProvider, validGifUrl } from '@/services/gifs';

export function MediaContent({media}: {media:ChatMedia}) {
  const [resolved,setResolved]=useState<string|null>(null),[failed,setFailed]=useState(false),[attempted,setAttempted]=useState(false);
  if(media.kind==='sticker'){
    const sticker=STICKERS.find(item=>item.id===media.id);
    return sticker?<img src={sticker.asset} alt={sticker.name} width={160} height={160} className="max-h-full max-w-full object-contain" loading="lazy"/>:<span>Sticker unavailable</span>;
  }
  if(failed||!validGifUrl(resolved||media.mediaUrl))return <span>{media.title||'GIF'} · GIF unavailable</span>;
  return <img src={resolved||media.mediaUrl} alt={media.title||'GIF'} width={media.width} height={media.height} className="max-h-64 max-w-full rounded-lg object-contain" loading="lazy" referrerPolicy="no-referrer" onError={()=>{
    if(attempted){setFailed(true);return;}setAttempted(true);
    void gifProvider.byId(media.id).then(item=>{if(item.mediaUrl===media.mediaUrl)setFailed(true);else setResolved(item.mediaUrl);}).catch(()=>setFailed(true));
  }}/>;
}
