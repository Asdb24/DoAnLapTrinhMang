"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator";
import { Search, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { spring } from "@/lib/springs";
import { useFluidHover } from "@/hooks/use-fluid-hover";
import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { GhostSpan } from "@/lib/font-weight";

export function ChatListSidebar() {
  const { conversations, setNewChatDialogOpen } = useChatFlow();
  const params = useParams();
  const activeId = params?.id as string | undefined;

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "groups">("all");
  const listRef = React.useRef<HTMLDivElement>(null);
  const hover = useFluidHover(listRef, { axis: "y" });

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === "unread") {
      return c.unreadCount > 0;
    }
    if (filterTab === "groups") {
      return c.type === "group";
    }
    return true;
  });

  return (
    <aside
      className={`${
        activeId ? "hidden md:flex" : "flex"
      } w-full md:w-80 border-r bg-card flex-col h-full shrink-0 select-none`}
    >
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Messages</h2>
            <p className="text-xs text-muted-foreground">
              {conversations.length} active conversations
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 rounded-lg"
            onClick={() => setNewChatDialogOpen(true)}
            aria-label="Create chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="chatlist-search-input"
            name="search"
            aria-label="Search conversations"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-8 text-xs bg-background"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter conversations"
          className="relative grid w-full grid-cols-3 h-9 p-0.5 rounded-lg bg-muted/60 text-muted-foreground select-none"
        >
          {(["all", "unread", "groups"] as const).map((tabKey) => {
            const isTabActive = filterTab === tabKey;
            const label = tabKey === "all" ? "All" : tabKey === "unread" ? "Unread" : "Groups";
            return (
              <button
                key={tabKey}
                role="tab"
                aria-selected={isTabActive}
                onClick={() => setFilterTab(tabKey)}
                className="relative z-10 flex items-center justify-center text-xs transition-colors py-1 px-2 rounded-md focus-visible:outline-none"
              >
                {isTabActive && (
                  <motion.div
                    layoutId="chatlist-active-tab"
                    className="absolute inset-0 rounded-md bg-background shadow-xs"
                    transition={spring.fast}
                  />
                )}
                <span className="relative z-10">
                  <GhostSpan active={isTabActive} activeWeight="semibold" restingWeight="medium">
                    {label}
                  </GhostSpan>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 p-2">
        {filteredConversations.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No conversations found.
          </div>
        ) : (
          <div ref={listRef} {...hover.handlers} className="relative space-y-1">
            <FluidHoverHighlight hover={hover} className="rounded-lg bg-accent/40 dark:bg-white/[0.06]" />
            {filteredConversations.map((conv, index) => {
              const isActive = activeId === conv.id;
              return (
                <Link
                  key={conv.id}
                  ref={(el) => hover.registerItem(index, el)}
                  href={`/chat/${conv.id}`}
                  className={`relative z-10 flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                    isActive
                      ? "bg-accent/80 text-accent-foreground dark:bg-white/[0.08] dark:text-foreground font-medium shadow-xs"
                      : "text-foreground"
                  }`}
                >
                  {/* Avatar & Status dot */}
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11 border border-border">
                      <AvatarImage src={conv.avatar} alt={conv.name} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">
                        {conv.type === "group" ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          conv.name.slice(0, 2).toUpperCase()
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {conv.type === "direct" && conv.presence && (
                      <span className="absolute bottom-0 right-0">
                        <UserStatusIndicator status={conv.presence} size="sm" />
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <GhostSpan
                        active={isActive}
                        activeWeight="semibold"
                        restingWeight="medium"
                        className="text-sm truncate"
                      >
                        {conv.name}
                      </GhostSpan>
                      <span className="text-[11px] text-muted-foreground shrink-0 font-normal">
                        {conv.lastMessageTime}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate leading-snug">
                        {conv.lastMessage}
                      </p>
                      {conv.unreadCount > 0 && (
                        <Badge
                          variant="default"
                          className="h-5 px-1.5 text-[10px] font-bold rounded-full shrink-0"
                        >
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
