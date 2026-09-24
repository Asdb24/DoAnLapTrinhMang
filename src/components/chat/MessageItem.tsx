"use client";

import React, { useState } from "react";
import { MessageType } from "@/types";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, CheckCheck, SmilePlus, FileText, Image as ImageIcon } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isUnconfirmed } from '@/services/messages';
import { MediaContent } from './MediaContent';

interface MessageItemProps {
  message: MessageType;
  conversationId: string;
  showSenderName?: boolean;
}

const COMMON_EMOJIS = ["👍", "❤️", "🔥", "🎉", "🚀", "👀", "😂"];

export function MessageItem({
  message,
  conversationId,
  showSenderName = false,
}: MessageItemProps) {
  const { addReaction, settings, pending, conversations } = useChatFlow();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isSent = message.isSentByMe;
  const isCompact = settings.density === "compact";

  const archived = conversations.find(c => c.id === conversationId)?.isArchived || isUnconfirmed(message);
  const handleReact = async (emoji: string) => {
    if (pending || archived) return;
    if (await addReaction(conversationId, message.id, emoji)) setPopoverOpen(false);
  };

  return (
    <div
      className={cn(
        "group relative flex gap-2.5",
        isSent ? "flex-row-reverse" : "flex-row",
        isCompact ? "py-1" : "py-2"
      )}
    >
      {/* Avatar for received messages */}
      {!isSent && (
        <Avatar className="h-8 w-8 mt-0.5 shrink-0 border border-border">
          <AvatarImage src={message.senderAvatar} alt={message.senderName} />
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">
            {(message.senderName || "??").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Bubble Container */}
      <div
        className={cn(
          "flex flex-col max-w-[75%] sm:max-w-[65%]",
          isSent ? "items-end" : "items-start"
        )}
      >
        {/* Sender Name in group or incoming */}
        {!isSent && showSenderName && (
          <span className="text-xs font-semibold text-muted-foreground mb-1 ml-1">
            {message.senderName}
          </span>
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            "relative rounded-2xl shadow-xs transition-colors",
            isCompact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
            isSent
              ? "bg-primary text-primary-foreground rounded-tr-xs"
              : "bg-secondary text-secondary-foreground rounded-tl-xs"
          )}
        >
          {/* Text Content */}
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
          {message.media&&<MediaContent key={message.media.id} media={message.media}/>}

          {/* Attachments if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {message.attachments.map((att, idx) => (
                <a
                  href={mediaUrl(att.url)}
                  download={att.name}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={att.url ? `Download ${att.name}` : `${att.name} (file unavailable)`}
                  key={idx}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg text-xs border",
                    isSent
                      ? "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground"
                      : "bg-background border-border text-foreground"
                  )}
                >
                  {att.type === "image" ? (
                    mediaUrl(att.url) ? <img src={mediaUrl(att.url)} alt={att.name} className="h-16 w-16 rounded object-cover" /> : <ImageIcon className="h-4 w-4 shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium truncate">{att.name}</span>
                  <span className="text-[10px] opacity-75 shrink-0 ml-auto">
                    {att.size}
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* Time & Read Receipts inside bubble footer */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1 justify-end text-[10px]",
              isSent ? "text-primary-foreground/75" : "text-muted-foreground"
            )}
          >
            <span>{message.timestamp}</span>
            {isSent && (
              <span>
                {message.status === 'sending' ? <span role="status">Sending…</span> : message.status === 'failed' ? <span role="status">Not sent · Retry from composer</span> : message.status === "read" ? (
                  <CheckCheck className="h-3.5 w-3.5 text-primary-foreground" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Reactions Row */}
        {message.reactions && message.reactions.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1 mt-1.5",
              isSent ? "justify-end" : "justify-start"
            )}
          >
            {message.reactions.map((reaction, i) => (
              <button
                key={i}
                disabled={pending || archived}
                onClick={() => handleReact(reaction.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                  reaction.reactedByMe
                    ? "bg-primary/10 border-primary/40 text-foreground font-semibold"
                    : "bg-card border-border hover:bg-muted text-muted-foreground"
                )}
              >
                <span>{reaction.emoji}</span>
                <span className="text-[11px]">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Trigger on Hover */}
      <div
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-center",
          isSent ? "order-first" : "order-last"
        )}
      >
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Add reaction"
              disabled={pending || archived}
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align={isSent ? "end" : "start"}
            className="p-1.5 w-auto flex items-center gap-1 bg-card border-border shadow-md"
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                disabled={pending || archived}
                onClick={() => handleReact(emoji)}
                className="h-7 w-7 rounded hover:bg-muted text-base flex items-center justify-center transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
