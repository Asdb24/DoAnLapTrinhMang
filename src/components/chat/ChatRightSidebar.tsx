"use client";

import React from "react";
import { useChatFlow } from "@/context/ChatFlowContext";
import { mediaUrl } from "@/lib/api";
import { Conversation, SharedMediaItem } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserStatusBadge } from "@/components/common/UserStatusIndicator";
import {
  X,
  FileText,
  ExternalLink,
  Image as ImageIcon,
  Users,
  Bell,
  BellOff,
  Search,
} from "lucide-react";

interface ChatRightSidebarProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ChatRightSidebar({
  conversation,
  onClose,
}: ChatRightSidebarProps) {
  const { setConversationMuted, pending, channels } = useChatFlow();
  const isMuted = !!conversation.isMuted;

  const attachments: SharedMediaItem[] = conversation.messages.flatMap(message => (message.attachments || []).map((attachment, index) => ({
    id: message.id + "-" + index, name: attachment.name, size: attachment.size,
    type: attachment.type === "image" ? "image" : "file", url: attachment.url, date: message.date,
  })));
  const shared = [...(conversation.sharedMedia || [])];
  for (const item of attachments) if (!item.url || !shared.some(existing => existing.url === item.url)) shared.push(item);
  const mediaItems = shared.filter(m => m.type === "image");
  const fileItems = shared.filter(m => m.type === "file");
  const linkItems = shared.filter(m => m.type === "link");

  return (
    <aside className="w-72 sm:w-80 border-l bg-card/80 backdrop-blur-sm flex flex-col h-full shrink-0 select-none animate-in slide-in-from-right-2 duration-200">
      {/* Header */}
      <div className="h-16 px-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Conversation Details</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close Sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {/* Profile Card Summary */}
        <div className="p-4 flex flex-col items-center text-center border-b space-y-3">
          <Avatar className="h-20 w-20 border-2 border-border shadow-xs">
            <AvatarImage src={conversation.avatar} alt={conversation.name} />
            <AvatarFallback className="text-xl font-bold bg-secondary text-secondary-foreground">
              {conversation.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-1">
            <h4 className="font-bold text-base">{conversation.name}</h4>
            {conversation.type === "direct" && (
              <div className="flex justify-center pt-1">
                <UserStatusBadge status={conversation.presence} />
              </div>
            )}
            {conversation.description && (
              <p className="text-xs text-muted-foreground pt-1 px-2 leading-relaxed">
                {conversation.description}
              </p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant={isMuted ? "secondary" : "outline"}
              size="sm"
              className="text-xs h-8 gap-1.5"
              disabled={pending}
              aria-pressed={isMuted}
              onClick={async () => { await setConversationMuted(conversation.id, !isMuted); }}
            >
              {isMuted ? (
                <>
                  <BellOff className="h-3.5 w-3.5" />
                  Muted
                </>
              ) : (
                <>
                  <Bell className="h-3.5 w-3.5" />
                  Mute
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Tabbed Content: Media, Files, Links */}
        <div className="p-4">
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="files" className="text-xs">
                Files
              </TabsTrigger>
              <TabsTrigger value="media" className="text-xs">
                Media
              </TabsTrigger>
              <TabsTrigger value="links" className="text-xs">
                Links
              </TabsTrigger>
            </TabsList>

            {/* Files Tab */}
            <TabsContent value="files" className="pt-3 space-y-2">
              {fileItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No files shared yet.
                </p>
              ) : (
                fileItems.map((item) => (
                  <a
                    href={mediaUrl(item.url)}
                    download={item.name}
                    target="_blank" rel="noreferrer"
                    key={item.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.size} • {item.date}</p>
                    </div>
                  </a>
                ))
              )}
            </TabsContent>

            {/* Media Tab */}
            <TabsContent value="media" className="pt-3">
              {mediaItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No photos shared yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {mediaItems.map((item) => (
                    <a
                      href={mediaUrl(item.url)}
                      download={item.name}
                      target="_blank" rel="noreferrer"
                      key={item.id}
                      className="group relative aspect-square rounded-lg overflow-hidden border bg-muted"
                    >
                      <img
                        src={mediaUrl(item.url)}
                        alt={item.name}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-background/80 backdrop-blur-xs p-1 text-[10px] truncate text-foreground">
                        {item.name}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Links Tab */}
            <TabsContent value="links" className="pt-3 space-y-2">
              {linkItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No links shared yet.
                </p>
              ) : (
                linkItems.map((item) => (
                  <a
                    key={item.id}
                    href={mediaUrl(item.url || item.name)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-xs text-foreground group"
                  >
                    <ExternalLink className="h-4 w-4 text-primary shrink-0 group-hover:underline" />
                    <span className="truncate group-hover:underline">{item.name}</span>
                  </a>
                ))
              )}
            </TabsContent>
          </Tabs>

          {/* Mutual Groups / Workspace details */}
          <div className="mt-6 pt-4 border-t space-y-2">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Channels
            </h5>
            <div className="space-y-1 text-xs">
              {channels.filter(channel => channel.isJoined).map(channel => <div key={channel.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-muted/40">
                <span className="truncate">#{channel.name}</span><span className="shrink-0 text-muted-foreground text-[11px]">{channel.subscriberCount} members</span>
              </div>)}
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
