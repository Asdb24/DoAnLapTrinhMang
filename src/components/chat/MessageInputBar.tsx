"use client";

import React, { useState, useRef } from "react";
import dynamic from 'next/dynamic';
import type { MessageAttachment } from "@/types";
import type { ChatMedia, MediaKind } from '@/types/media';
import { MediaContent } from './MediaContent';
import { useAttachmentUploads } from './useAttachmentUploads';
import { useChatFlow } from "@/context/ChatFlowContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Paperclip,
  Smile,
  Send,
  X,
  FileText,
  Image as ImageIcon,
  Sticker,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageInputBarProps {
  conversationId: string;
  recipientName: string;
}
const MediaPicker = dynamic(()=>import('./MediaPicker'),{loading:()=> <p role="status" className="p-4 text-sm">Loading media picker…</p>});



export function MessageInputBar({
  conversationId,
  recipientName,
}: MessageInputBarProps) {
  const { sendMessage, uploadFile, discardUpload, settings, dismissError, currentUser } = useChatFlow();
  const [content, setContent] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pickerTab,setPickerTab] = useState<MediaKind>('emoji');
  const [media,setMedia] = useState<ChatMedia|null>(null);
  const selection = useRef({start:0,end:0});
  const uploads = useAttachmentUploads(conversationId, { uploadFile, discardUpload });
  const attachments = uploads.drafts;
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (sendingRef.current || !uploads.ready || (!content.trim() && attachments.length === 0 && !media)) return;
    sendingRef.current = true;
    setSending(true);
    setFileError(null);
    dismissError();
    uploads.beginSend();
    let success = false;
    try {
      const uploaded: MessageAttachment[] = attachments.map(draft => draft.uploaded!);
      const signature = JSON.stringify([content, uploaded.map(item => item.id),media]);
      if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
      if (await sendMessage(conversationId, content, uploaded.length ? uploaded : undefined, retry.current.id, media || undefined)) {
        retry.current = null;
        setContent("");
        setMedia(null);
        success = true;
      }
    } finally {
      uploads.finishSend(success);
      sendingRef.current = false;
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && ((settings.enterToSend && !e.shiftKey) || (!settings.enterToSend && (e.ctrlKey || e.metaKey)))) {
      e.preventDefault();
      void handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    const {start,end}=selection.current;
    setContent(previous => previous.slice(0,start)+emoji+previous.slice(end));
    selection.current={start:start+emoji.length,end:start+emoji.length};
    setEmojiOpen(false);
    requestAnimationFrame(()=>{textareaRef.current?.focus();textareaRef.current?.setSelectionRange(selection.current.start,selection.current.end);});
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if(media){setFileError('Send the GIF or sticker before attaching files.');return;}
    try { uploads.add(files); setFileError(null); }
    catch (error) { setFileError(error instanceof Error ? error.message : 'Unable to attach these files.'); }
    textareaRef.current?.focus();
  };

  const removeAttachment = (id: string) => {
    uploads.remove(id);
    textareaRef.current?.focus();
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-3 sm:p-4 border-t bg-card/60 backdrop-blur-sm shrink-0">
        {fileError && <p role="alert" className="mb-2 text-xs text-destructive">{fileError}</p>}
        {sending && <p role="status" className="mb-2 text-xs text-muted-foreground">Sending…</p>}
        {media&&<div className="flex items-center gap-3 mb-2"><div className="h-20 w-24 overflow-hidden"><MediaContent media={media}/></div><span className="text-xs text-muted-foreground">Ready to send {media.kind}</span><Button variant="ghost" size="icon" disabled={sending} aria-label="Remove selected media" onClick={()=>setMedia(null)}><X className="h-4 w-4"/></Button></div>}

        {/* Attached Files Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map(({ id, file, status }) => (
              <div
                key={id}
                className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs border border-border"
              >
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-primary" />
                )}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <span role="status">{sending ? 'Sending…' : status === 'uploaded' ? 'Ready' : status === 'uploading' ? 'Uploading…' : status === 'failed' ? 'Not uploaded' : 'Waiting…'}</span>
                {status === 'failed' && <Button type="button" variant="ghost" size="sm" onClick={() => uploads.retry(id)} aria-label={`Retry upload ${file.name}`}>Retry</Button>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={sending}
                  onClick={() => removeAttachment(id)}
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Main Input Box */}
        <div className="relative flex flex-wrap sm:flex-nowrap items-end gap-2 border rounded-xl bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 transition-all">
          {/* Hidden File Input */}
          <input
            type="file"
            aria-label="Choose attachments"
            disabled={sending}
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />

          {/* Attach Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach File"
                disabled={sending}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach Files</TooltipContent>
          </Tooltip>

          {/* Text Area */}
          <Textarea
            ref={textareaRef}
            readOnly={sending}
            aria-label={`Message ${recipientName}`}
            value={content}
            onChange={(e) => {setContent(e.target.value);selection.current={start:e.target.selectionStart,end:e.target.selectionEnd};}}
            onBlur={event=>{selection.current={start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd};}}
            onSelect={event=>{selection.current={start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd};}}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${recipientName}...`}
            className="order-first basis-full min-w-0 sm:order-none sm:basis-auto min-h-[38px] max-h-32 border-0 bg-transparent resize-none p-2 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground shadow-none"
            rows={1}
          />

          {/* Emoji Popover */}
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                aria-label="Add Emoji"
                onClick={()=>setPickerTab('emoji')}
                disabled={sending}
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" aria-label="Choose chat media" onCloseAutoFocus={event=>{event.preventDefault();textareaRef.current?.focus();textareaRef.current?.setSelectionRange(selection.current.start,selection.current.end);}} className="w-[min(360px,calc(100vw-24px))] p-3 bg-card border-border shadow-lg">
              {emojiOpen&&<MediaPicker key={`${currentUser.id}:${pickerTab}`} userId={currentUser.id} initialTab={pickerTab} onEmoji={addEmoji} onMedia={selected=>{if(attachments.length){setFileError('Remove file attachments before choosing a GIF or sticker.');return;}setMedia(selected);setEmojiOpen(false);textareaRef.current?.focus();}}/>}
            </PopoverContent>
          </Popover>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-xs font-semibold" aria-label="Add GIF" title="Add GIF" disabled={sending} onClick={()=>{setPickerTab('gif');setEmojiOpen(true);}}>GIF</Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Add Sticker" title="Add Sticker" disabled={sending} onClick={()=>{setPickerTab('sticker');setEmojiOpen(true);}}><Sticker className="h-4 w-4"/></Button>

          {/* Send Button */}
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={sending || !uploads.ready || (!content.trim() && attachments.length === 0 && !media)}
            className="h-9 w-9 shrink-0 rounded-lg shadow-xs"
            aria-label="Send Message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
