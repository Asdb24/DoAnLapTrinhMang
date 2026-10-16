"use client";

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
  Link2,
  Bell,
  BellOff,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

interface ChatRightSidebarProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ChatRightSidebar({
  conversation,
  onClose,
}: ChatRightSidebarProps) {
  const { setConversationMuted, pending, channels, blockedUsers, blockUser, unblockUser } = useChatFlow();
  const isMuted = !!conversation.isMuted;
  const isBlocked = Boolean(conversation.otherUserId && blockedUsers.some(b => b.id === conversation.otherUserId));

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
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-80 max-w-[calc(100vw-2rem)] border-l bg-card flex flex-col h-full shadow-2xl md:static md:z-auto md:w-80 md:shadow-none shrink-0 select-none animate-in slide-in-from-right duration-200">
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

            {conversation.type === "direct" && conversation.otherUserId && (
              <Button
                variant={isBlocked ? "outline" : "outline"}
                size="sm"
                className={`text-xs h-8 gap-1.5 ${isBlocked ? "text-primary border-primary/50" : "text-destructive border-destructive/30 hover:bg-destructive/10"}`}
                disabled={pending}
                onClick={async () => {
                  if (isBlocked) {
                    await unblockUser(conversation.otherUserId!);
                  } else {
                    await blockUser(conversation.otherUserId!);
                  }
                }}
              >
                {isBlocked ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                    Unblock
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Block
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="p-4">
          <Tabs defaultValue="media" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-9 p-1 bg-muted/60 rounded-xl border border-border/50">
              <TabsTrigger
                value="media"
                className="text-xs gap-1.5 font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground transition-all"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Media
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="text-xs gap-1.5 font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground transition-all"
              >
                <FileText className="h-3.5 w-3.5" />
                Files
              </TabsTrigger>
              <TabsTrigger
                value="links"
                className="text-xs gap-1.5 font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground transition-all"
              >
                <Link2 className="h-3.5 w-3.5" />
                Links
              </TabsTrigger>
            </TabsList>

            <TabsContent value="media" className="pt-3">
              {mediaItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <ImageIcon className="h-7 w-7 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-xs font-medium">No media shared yet</p>
                </div>
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
                        width={140}
                        height={140}
                        loading="lazy"
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

            <TabsContent value="files" className="pt-3 space-y-2">
              {fileItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <FileText className="h-7 w-7 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-xs font-medium">No files shared yet</p>
                </div>
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

            <TabsContent value="links" className="pt-3 space-y-2">
              {linkItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Link2 className="h-7 w-7 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-xs font-medium">No links shared yet</p>
                </div>
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
    </>
  );
}
