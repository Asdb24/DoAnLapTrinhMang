"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { Conversation, MessageType } from "@/types";
import { MessageItem } from "./MessageItem";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Button } from "@/components/ui/button";

interface MessageHistoryProps {
  conversation: Conversation;
}

export function MessageHistory({ conversation }: MessageHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { hasOlder, loadingMessages, loadOlder } = useChatFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const loadingOlder = useRef(false);
  const older = useCallback(async () => {
    if (loadingOlder.current || loadingMessages || !hasOlder) return;
    const viewport = wrapperRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    const height = viewport?.scrollHeight || 0;
    const top = viewport?.scrollTop || 0;
    loadingOlder.current = true;
    await loadOlder();
    requestAnimationFrame(() => { if (viewport) viewport.scrollTop = top + viewport.scrollHeight - height; loadingOlder.current = false; });
  }, [loadOlder, loadingMessages, hasOlder]);
  useEffect(() => {
    const viewport = wrapperRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    let previousTop = viewport.scrollTop;
    const onScroll = () => {
      const top = viewport.scrollTop;
      if (top < previousTop && top < 80) void older();
      previousTop = top;
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [older]);

  // Auto-scroll on conversation switch or new message
  useEffect(() => {
    if (!loadingOlder.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.id, conversation.messages.at(-1)?.id]);

  // Only merge adjacent date labels; the API's message order is authoritative.
  const dateSections: { date: string; messages: MessageType[] }[] = [];
  for (const message of conversation.messages) {
    const date = message.date || "Today";
    const previous = dateSections[dateSections.length - 1];
    if (previous?.date === date) {
      previous.messages.push(message);
    } else {
      dateSections.push({ date, messages: [message] });
    }
  }

  return (
    <div ref={wrapperRef} className="flex-1 min-h-0"><ScrollArea className="h-full p-4 sm:p-6">
      <div className="space-y-4">
        {hasOlder && <div className="text-center"><Button variant="outline" size="sm" disabled={loadingMessages} onClick={older}>Load older messages</Button></div>}
        {conversation.messages.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <p className="text-sm font-medium">No messages yet in this conversation.</p>
            <p className="text-xs mt-1">Send a message below to start the conversation!</p>
          </div>
        ) : (
          dateSections.map(({ date, messages }) => (
            <div key={messages[0].id} className="space-y-3">
              {/* Date Separator */}
              <div className="relative flex items-center justify-center my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <Badge
                  variant="outline"
                  className="relative bg-background text-muted-foreground text-[11px] font-medium px-2.5 py-0.5"
                >
                  {date}
                </Badge>
              </div>

              {/* Messages for this date */}
              <div className="space-y-1">
                {messages.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    conversationId={conversation.id}
                    showSenderName={conversation.type === "group"}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea></div>
  );
}
