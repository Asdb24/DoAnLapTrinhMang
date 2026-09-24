import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaPicker from '@/components/chat/MediaPicker';
import { loadMediaUsage } from '@/services/media';
import { gifProvider } from '@/services/gifs';
import type { GifMedia, MediaUsage } from '@/types/media';
vi.mock('@/services/media',async original=>({...await original<typeof import('@/services/media')>(),loadMediaUsage:vi.fn()}));
vi.mock('@/services/gifs',async original=>({...await original<typeof import('@/services/gifs')>(),gifProvider:{search:vi.fn(),byId:vi.fn()}}));
const gif:GifMedia={kind:'gif',provider:'giphy',id:'hello123',title:'Hello wave',mediaUrl:'https://media.giphy.com/media/hello123/giphy.gif',previewUrl:'https://media.giphy.com/media/hello123/giphy.gif',width:160,height:100};
const usage=(kind:'emoji'|'gif'|'sticker',id:string,count:number,metadata:unknown={}):MediaUsage=>({user_id:'a',media_type:kind,media_id:id,use_count:count,last_used_at:new Date().toISOString(),metadata});
beforeEach(()=>{vi.mocked(loadMediaUsage).mockReset().mockResolvedValue([]);vi.mocked(gifProvider.search).mockReset().mockResolvedValue({items:[gif],next:null});});
describe('shadcn media picker',()=>{
 it('searches emoji, navigates by keyboard and selects Unicode',async()=>{
  const onEmoji=vi.fn();render(<MediaPicker userId="a" initialTab="emoji" onEmoji={onEmoji} onMedia={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Search emoji'),{target:{value:'heart eyes'}});
  const button=screen.getByRole('button',{name:/heart eyes love/});button.focus();fireEvent.keyDown(button,{key:'ArrowRight'});expect(button).toHaveFocus();fireEvent.click(button);
  expect(onEmoji).toHaveBeenCalledWith('😍');expect(loadMediaUsage).toHaveBeenCalledWith('a');
 });
 it('shows the current user recent/frequent emoji and replaces usage after account change',async()=>{
  vi.mocked(loadMediaUsage).mockResolvedValueOnce([usage('emoji','🔥',10)]).mockResolvedValueOnce([usage('emoji','💙',2)]);
  const props={initialTab:'emoji' as const,onEmoji:vi.fn(),onMedia:vi.fn()};const view=render(<MediaPicker userId="a" {...props}/>);
  await waitFor(()=>expect(loadMediaUsage).toHaveBeenCalledWith('a'));fireEvent.click(screen.getByRole('button',{name:'Frequently used'}));await screen.findByRole('button',{name:'fire 🔥'});
  view.rerender(<MediaPicker userId="b" {...props}/>);await screen.findByRole('button',{name:'blue heart 💙'});expect(screen.queryByRole('button',{name:'fire 🔥'})).not.toBeInTheDocument();
 });
 it('previews a built-in sticker before choosing and displays recent/frequent stickers',async()=>{
  vi.mocked(loadMediaUsage).mockResolvedValue([usage('sticker','orb-v1-love',4,{kind:'sticker',id:'orb-v1-love'})]);const onMedia=vi.fn();
  render(<MediaPicker userId="a" initialTab="sticker" onEmoji={()=>{}} onMedia={onMedia}/>);
  fireEvent.click(screen.getByRole('button',{name:'Big love'}));expect(onMedia).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Use sticker'}));expect(onMedia).toHaveBeenCalledWith({kind:'sticker',id:'orb-v1-love'});
  await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'Recent'}));expect(screen.getByRole('button',{name:'Big love'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Hello sunshine'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Frequently used'}));expect(screen.getByRole('button',{name:'Big love'})).toBeInTheDocument();
 });
 it('searches GIFs, previews before use, and loads personalized recent/frequent GIFs',async()=>{
  vi.mocked(loadMediaUsage).mockResolvedValue([usage('gif',gif.id,5,gif)]);const onMedia=vi.fn();
  render(<MediaPicker userId="a" initialTab="gif" onEmoji={()=>{}} onMedia={onMedia}/>);
  fireEvent.change(screen.getByLabelText('Search gif'),{target:{value:'wave'}});
  fireEvent.click(await screen.findByRole('button',{name:'Preview Hello wave'}));expect(onMedia).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Use GIF'}));expect(onMedia).toHaveBeenCalledWith(gif);
  expect(gifProvider.search).toHaveBeenLastCalledWith('wave',0,expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button',{name:'Recent'}));expect(screen.getByRole('button',{name:'Preview Hello wave'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Frequently used'}));expect(screen.getByRole('button',{name:'Preview Hello wave'})).toBeInTheDocument();
 });
 it('shows an actionable GIF failure and retries without losing search',async()=>{
  vi.mocked(gifProvider.search).mockRejectedValueOnce(new Error('Provider offline'));
  render(<MediaPicker userId="a" initialTab="gif" onEmoji={()=>{}} onMedia={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Search gif'),{target:{value:'wave'}});await screen.findByText('Provider offline');
  fireEvent.click(screen.getByRole('button',{name:'Retry GIF search'}));await screen.findByRole('button',{name:'Preview Hello wave'});expect(screen.getByLabelText('Search gif')).toHaveValue('wave');
 });
});
