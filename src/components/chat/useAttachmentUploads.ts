"use client";

import { useEffect, useRef, useState } from 'react';
import { validateFile } from '@/lib/attachment-validation';
import type { MessageAttachment } from '@/types';

type Draft = { id: string; file: File; status: 'selected' | 'uploading' | 'uploaded' | 'failed'; uploaded?: MessageAttachment };
type Operations = { uploadFile: (file: File, conversationId: string) => Promise<MessageAttachment | null>; discardUpload: (id: string) => Promise<boolean> };

/** Two uploads at a time; removed/unmounted drafts are discarded when their upload finishes. */
export function useAttachmentUploads(conversationId: string, operations: Operations) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const items = useRef<Draft[]>([]), active = useRef(0), mounted = useRef(true);
  const submitted = useRef(new Set<string>());
  const ops = useRef(operations); ops.current = operations;
  const publish = () => { if (mounted.current) setDrafts([...items.current]); };
  const pump = () => {
    if (!mounted.current) return;
    for (const draft of items.current) {
      if (active.current >= 2) break;
      if (draft.status !== 'selected') continue;
      draft.status = 'uploading'; active.current++;
      void ops.current.uploadFile(draft.file, conversationId).then(uploaded => {
        if (!mounted.current || !items.current.includes(draft)) {
          if (uploaded?.id) void ops.current.discardUpload(uploaded.id);
          return;
        }
        draft.uploaded = uploaded || undefined;
        draft.status = uploaded ? 'uploaded' : 'failed';
      }).catch(() => { draft.status = 'failed'; }).finally(() => {
        active.current--; publish(); pump();
      });
    }
    publish();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const draft of items.current) {
        if (draft.uploaded?.id && !submitted.current.has(draft.id)) void ops.current.discardUpload(draft.uploaded.id);
      }
    };
  }, []);
  return {
    drafts,
    add(files: File[]) {
      if (items.current.length + files.length > 5) throw new Error('Attach up to 5 files per message.');
      files.forEach(validateFile);
      items.current.push(...files.map(file => ({ id: crypto.randomUUID(), file, status: 'selected' as const })));
      pump();
    },
    retry(id: string) { const draft = items.current.find(item => item.id === id); if (draft?.status === 'failed') { draft.status = 'selected'; pump(); } },
    remove(id: string) {
      const draft = items.current.find(item => item.id === id);
      items.current = items.current.filter(item => item.id !== id);
      if (draft?.uploaded?.id) void ops.current.discardUpload(draft.uploaded.id);
      publish();
    },
    beginSend() { submitted.current = new Set(items.current.map(item => item.id)); },
    finishSend(success: boolean) {
      if (!success && !mounted.current) {
        for (const draft of items.current) {
          if (draft.uploaded?.id && submitted.current.has(draft.id)) void ops.current.discardUpload(draft.uploaded.id);
        }
        items.current = [];
      }
      if (success) { items.current = []; publish(); }
      submitted.current.clear();
    },
    ready: drafts.every(item => item.status === 'uploaded'),
  };
}
