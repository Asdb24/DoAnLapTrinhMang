"use client";

import React, { useState, useEffect } from "react";
import { useChatFlow } from "@/context/ChatFlowContext";
import { ChatHeader } from "./ChatHeader";
import { MessageHistory } from "./MessageHistory";
import { MessageInputBar } from "./MessageInputBar";
import { ChatRightSidebar } from "./ChatRightSidebar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessageSquareOff } from "lucide-react";

export function ChatRoom({ id }: { id: string }) {
  const { conversations, markConversationAsRead, setActiveConversationId, realtimeStatus, loadingMessages } = useChatFlow();
  useEffect(() => { setActiveConversationId(id); return () => setActiveConversationId(null); }, [id, setActiveConversationId]);
  const [showDetails, setShowDetails] = useState(false);

  const conversation = conversations.find((c) => c.id === id);
  const unreadSignature = conversation?.messages.filter(message => !message.isSentByMe && message.status !== "read").map(message => message.id).join(",") || "";
  const unreadCount = conversation?.unreadCount || 0;
  const latestMessageId = conversation?.messages.at(-1)?.id;
  useEffect(() => {
    const markRead = async () => {
      if (id && (unreadCount > 0 || unreadSignature) && document.visibilityState === "visible") await markConversationAsRead(id);
    };
    void markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [id, unreadCount, unreadSignature, latestMessageId, markConversationAsRead]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <MessageSquareOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Conversation Not Found</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          This thread may have been removed or does not exist.
        </p>
        <Button asChild>
          <Link href="/">Return to Messages</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Main Conversation Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <ChatHeader
          conversation={conversation}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
        />
        <div className="px-4 py-1 text-xs text-muted-foreground" role="status">{loadingMessages ? 'Loading messages…' : realtimeStatus === 'SUBSCRIBED' ? 'Connected · Live messages' : 'Reconnecting… Messages will sync when connected.'}</div>
        <MessageHistory conversation={conversation} />
        {conversation.isArchived ? <div className="border-t bg-muted/30 p-4 text-center text-sm text-muted-foreground">Imported history · This conversation is read-only. Start a new conversation to send messages. <a href="/api/migrate" download="chatflow-browser-backup.json" className="ml-1 underline text-primary">Download imported backup</a></div> : <MessageInputBar
          key={conversation.id}
          conversationId={conversation.id}
          recipientName={conversation.name}
        />}
      </div>

      {/* Optional Collapsible Right Sidebar */}
      {showDetails && (
        <ChatRightSidebar
          conversation={conversation}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}
