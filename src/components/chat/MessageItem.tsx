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
import {
  Check,
  CheckCheck,
  SmilePlus,
  FileText,
  Image as ImageIcon,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isUnconfirmed } from "@/services/messages";
import { MediaContent } from "./MediaContent";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import {
  Bubble,
  BubbleContent,
} from "@/components/ui/bubble";

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
  const { addReaction, settings, pending, conversations, deleteMessage, editMessage } = useChatFlow();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);

  const isSent = message.isSentByMe;
  const isCompact = settings.density === "compact";
  const isDeleted = Boolean(message.isDeleted || message.content === "Message deleted");
  const isSticker = Boolean(message.media?.kind === "sticker" && !message.content);
  const isGifOnly = Boolean(message.media?.kind === "gif" && !message.content);
  const isMediaOnly = isSticker || isGifOnly;

  const archived = conversations.find((c) => c.id === conversationId)?.isArchived || isUnconfirmed(message);
  const handleReact = async (emoji: string) => {
    if (pending || archived || isDeleted) return;
    if (await addReaction(conversationId, message.id, emoji)) setPopoverOpen(false);
  };

  const handleSaveEdit = async () => {
    const trimmed = editDraft.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    await editMessage(conversationId, message.id, trimmed);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tin nhắn này không?")) {
      await deleteMessage(conversationId, message.id);
    }
  };

  return (
    <Message
      align={isSent ? "end" : "start"}
      className={cn(
        "group relative",
        isCompact ? "py-0.5" : "py-1"
      )}
    >
      {/* Avatar for received messages */}
      {!isSent && (
        <MessageAvatar>
          <Avatar className="h-8 w-8 shrink-0 border border-border">
            <AvatarImage src={message.senderAvatar} alt={message.senderName} />
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">
              {(message.senderName || "??").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </MessageAvatar>
      )}

      {/* Message Content Container */}
      <MessageContent>
        {/* Header with Sender Name in group or incoming */}
        {!isSent && showSenderName && (
          <MessageHeader>
            <span className="font-semibold text-muted-foreground">{message.senderName}</span>
          </MessageHeader>
        )}

        {/* Bubble Row with hover actions */}
        <div className="relative flex items-center gap-1.5 group/bubble-row">
          {/* Action Trigger on Hover for sent messages (left side) */}
          {isSent && !isDeleted && (
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 self-center order-first"
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
                  align="end"
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

              {!isUnconfirmed(message) && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Edit message"
                    title="Chỉnh sửa tin nhắn"
                    disabled={pending || archived || isEditing}
                    onClick={() => {
                      setEditDraft(message.content);
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="Delete message"
                    title="Xóa tin nhắn"
                    disabled={pending || archived || isEditing}
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Bubble Component */}
          <Bubble
            variant={
              isDeleted
                ? "muted"
                : isMediaOnly
                ? "ghost"
                : isSent
                ? "default"
                : "secondary"
            }
            align={isSent ? "end" : "start"}
            className={cn(
              isDeleted && "border border-dashed border-border rounded-xl",
              isMediaOnly && "p-0 bg-transparent border-none"
            )}
          >
            <BubbleContent
              className={cn(
                isCompact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
                !isMediaOnly && (isSent ? "rounded-tr-xs" : "rounded-tl-xs"),
                isMediaOnly && "p-0 border-none bg-transparent overflow-visible",
                isDeleted && "italic"
              )}
            >
              {isDeleted ? (
                <p className="italic text-muted-foreground leading-relaxed text-xs">
                  Tin nhắn đã bị thu hồi
                </p>
              ) : isEditing ? (
                <div className="space-y-1.5 py-1 min-w-[200px]">
                  <textarea
                    className="w-full text-xs sm:text-sm bg-background text-foreground border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit();
                      } else if (e.key === "Escape") {
                        setIsEditing(false);
                      }
                    }}
                    rows={2}
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setEditDraft(message.content);
                        setIsEditing(false);
                      }}
                    >
                      <X className="h-3 w-3 mr-1" /> Hủy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-6 px-2 text-xs"
                      disabled={!editDraft.trim() || editDraft.trim() === message.content}
                      onClick={handleSaveEdit}
                    >
                      <Check className="h-3 w-3 mr-1" /> Lưu
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {Boolean(message.content?.trim()) && (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {message.content}
                    </p>
                  )}
                  {message.media && (
                    <div className={cn(Boolean(message.content?.trim()) && "mt-2")}>
                      <MediaContent key={message.media.id} media={message.media} />
                    </div>
                  )}

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
                            mediaUrl(att.url) ? (
                              <img src={mediaUrl(att.url)} alt={att.name} className="h-16 w-16 rounded object-cover" />
                            ) : (
                              <ImageIcon className="h-4 w-4 shrink-0" />
                            )
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
                </>
              )}

              {/* Time & Read Receipts */}
              <div
                className={cn(
                  "flex items-center gap-1.5 mt-1 justify-end text-[10px]",
                  isDeleted || isMediaOnly
                    ? "text-muted-foreground"
                    : isSent
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground"
                )}
              >
                {message.isEdited && !isDeleted && (
                  <span className="italic opacity-80">(đã chỉnh sửa)</span>
                )}
                <span>{message.timestamp}</span>
                {isSent && !isDeleted && (
                  <span>
                    {message.status === "sending" ? (
                      <span role="status">Sending…</span>
                    ) : message.status === "failed" ? (
                      <span role="status">Not sent · Retry from composer</span>
                    ) : message.status === "read" ? (
                      <CheckCheck
                        className={cn(
                          "h-3.5 w-3.5",
                          isMediaOnly ? "text-primary" : "text-primary-foreground"
                        )}
                      />
                    ) : (
                      <Check
                        className={cn(
                          "h-3 w-3",
                          isMediaOnly ? "text-muted-foreground" : "text-primary-foreground/80"
                        )}
                      />
                    )}
                  </span>
                )}
              </div>
            </BubbleContent>
          </Bubble>

          {/* Action Trigger on Hover for received messages (right side) */}
          {!isSent && !isDeleted && (
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 self-center order-last"
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
                  align="start"
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
          )}
        </div>

        {/* Reactions Row */}
        {!isDeleted && message.reactions && message.reactions.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1 mt-1",
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
      </MessageContent>
    </Message>
  );
}
