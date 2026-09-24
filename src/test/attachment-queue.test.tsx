import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAttachmentUploads } from '@/components/chat/useAttachmentUploads';
import type { MessageAttachment } from '@/types';
import { deferred } from './setup';
const file=(name:string)=>new File(['bytes'],name,{type:'text/plain'});
const attachment=(id:string):MessageAttachment=>({id,name:id,type:'doc',size:'5 B',url:'/api/attachments/'+id});
describe('attachment upload queue',()=>{
 it('preuploads at concurrency two, never duplicates work and sends only after all are ready',async()=>{
  const one=deferred<MessageAttachment|null>(),two=deferred<MessageAttachment|null>(),three=deferred<MessageAttachment|null>();
  const uploadFile=vi.fn().mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise).mockReturnValueOnce(three.promise),discardUpload=vi.fn(async()=>true);
  const {result}=renderHook(()=>useAttachmentUploads('conversation',{uploadFile,discardUpload}));
  act(()=>result.current.add([file('one.txt'),file('two.txt'),file('three.txt')]));
  expect(uploadFile).toHaveBeenCalledTimes(2);expect(result.current.ready).toBe(false);
  await act(async()=>one.resolve(attachment('one')));expect(uploadFile).toHaveBeenCalledTimes(3);
  await act(async()=>{two.resolve(attachment('two'));three.resolve(attachment('three'));});
  expect(result.current.ready).toBe(true);expect(result.current.drafts.every(d=>d.status==='uploaded')).toBe(true);
  act(()=>result.current.beginSend());act(()=>result.current.finishSend(false));
  expect(result.current.drafts).toHaveLength(3);expect(uploadFile).toHaveBeenCalledTimes(3);
 });
 it('allows explicit failed retry and discards a removed upload that finishes late',async()=>{
  const pending=deferred<MessageAttachment|null>(),uploadFile=vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(pending.promise),discardUpload=vi.fn(async()=>true);
  const {result}=renderHook(()=>useAttachmentUploads('conversation',{uploadFile,discardUpload}));
  act(()=>result.current.add([file('one.txt')]));await waitFor(()=>expect(result.current.drafts[0].status).toBe('failed'));
  const id=result.current.drafts[0].id;act(()=>result.current.retry(id));act(()=>result.current.remove(id));
  await act(async()=>pending.resolve(attachment('late')));
  expect(result.current.drafts).toHaveLength(0);expect(discardUpload).toHaveBeenCalledWith('late');expect(uploadFile).toHaveBeenCalledTimes(2);
 });
 it('cleans abandoned completed and in-flight uploads on unmount',async()=>{
  const pending=deferred<MessageAttachment|null>(),uploadFile=vi.fn().mockResolvedValueOnce(attachment('ready')).mockReturnValueOnce(pending.promise),discardUpload=vi.fn(async()=>true);
  const {result,unmount}=renderHook(()=>useAttachmentUploads('conversation',{uploadFile,discardUpload}));
  await act(async()=>result.current.add([file('one.txt'),file('two.txt')]));unmount();
  await act(async()=>pending.resolve(attachment('late')));
  expect(discardUpload).toHaveBeenCalledWith('ready');expect(discardUpload).toHaveBeenCalledWith('late');
 });
 it('does not discard files while a submitted message awaits confirmation',async()=>{
  const uploadFile=vi.fn(async()=>attachment('submitted')),discardUpload=vi.fn(async()=>true);
  const {result,unmount}=renderHook(()=>useAttachmentUploads('conversation',{uploadFile,discardUpload}));
  await act(async()=>result.current.add([file('one.txt')]));act(()=>result.current.beginSend());unmount();
  expect(discardUpload).not.toHaveBeenCalled();
 });
});


it.each([false,true])('settles an unmounted submitted upload with success=%s',async(success)=>{
 const uploadFile=vi.fn(async()=>attachment('submitted')),discardUpload=vi.fn(async()=>true);
 const {result,unmount}=renderHook(()=>useAttachmentUploads('conversation',{uploadFile,discardUpload}));
 await act(async()=>result.current.add([file('one.txt')]));
 const finishSend=result.current.finishSend;
 act(()=>result.current.beginSend());unmount();
 expect(discardUpload).not.toHaveBeenCalled();
 await act(async()=>finishSend(success));
 expect(discardUpload).toHaveBeenCalledTimes(success?0:1);
 if(!success)expect(discardUpload).toHaveBeenCalledWith('submitted');
 await act(async()=>finishSend(success));
 expect(discardUpload).toHaveBeenCalledTimes(success?0:1);
});
