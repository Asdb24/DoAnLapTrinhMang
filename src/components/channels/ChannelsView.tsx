"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { Channel } from "@/types";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserStatusBadge } from "@/components/common/UserStatusIndicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateChannelDialog } from "./CreateChannelDialog";
import {
  Hash,
  Lock,
  Plus,
  Search,
  Users,
  LayoutGrid,
  List as ListIcon,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";

export function ChannelsView() {
  const { channels, toggleJoinChannel, openChannelChat, settings, pending } = useChatFlow();
  const [inviteChannel, setInviteChannel] = useState<Channel | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const router = useRouter();

  const handleOpenChannel = async (channelId: string) => {
    if (pending) return;
    const convId = await openChannelChat(channelId);
    if (convId) {
      router.push(`/chat/${convId}`);
    }
  };

  const filteredChannels = channels.filter((channel) => {
    const matchesSearch =
      channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || channel.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <ScrollArea className="flex-1 h-full bg-background">
      {/* Page Header */}
      <div className="border-b bg-card/40 px-6 py-6 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Channels & Groups</h1>
              <UserStatusBadge status={settings.presence || "online"} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Browse public spaces or collaborate in private channels across your organization.
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2 shrink-0 self-start sm:self-auto shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Create Channel
          </Button>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search channels by name or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          {/* Category Dropdown */}
          <div className="w-full sm:w-48">
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Engineering">Engineering</SelectItem>
                <SelectItem value="Design">Design</SelectItem>
                <SelectItem value="Product">Product</SelectItem>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Random">Random</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center border rounded-lg p-0.5 bg-muted/40 shrink-0 self-end sm:self-auto">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-md"
              onClick={() => setViewMode("grid")}
              aria-label="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-md"
              onClick={() => setViewMode("list")}
              aria-label="List View"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Channels Grid/List */}
      <div className="p-6 sm:p-8 flex-1">
        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Hash className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">No channels found</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              We couldn't find any channels matching "{searchQuery}". Try a different keyword or create a new channel.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChannels.map((channel) => (
              <Card
                key={channel.id}
                className="flex flex-col justify-between border-border bg-card/60 hover:bg-card transition-colors hover:shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        {channel.isPrivate ? (
                          <Lock className="h-4 w-4 text-primary" />
                        ) : (
                          <Hash className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-bold truncate">
                          {channel.name}
                        </CardTitle>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />
                          {channel.subscriberCount} members
                        </span>
                      </div>
                    </div>

                    <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                      {channel.category}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs line-clamp-2 mt-2 leading-relaxed">
                    {channel.description}
                  </CardDescription>
                </CardHeader>

                <CardFooter className="pt-2 border-t flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {channel.isJoined && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        <span>Joined</span>
                      </>
                    )}
                  </div>

                  {channel.isJoined ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleOpenChannel(channel.id)}
                        className="h-8 text-xs gap-1"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Chat
                      </Button>
                      {channel.isOwner && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInviteChannel(channel)}>Invite</Button>}
                      <Button
                        variant="destructive"
                        size="sm"
                        title={channel.isOwner ? "Channel owners cannot leave their channel" : undefined}
                        disabled={pending || channel.isOwner}
                        onClick={async () => { await toggleJoinChannel(channel.id); }}
                        className="h-8 text-xs"
                      >
                        Leave
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={pending}
                        onClick={async () => { await toggleJoinChannel(channel.id); }}
                      className="h-8 text-xs"
                    >
                      Join
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {filteredChannels.map((channel) => (
              <Card
                key={channel.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-border bg-card/60 hover:bg-card transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    {channel.isPrivate ? (
                      <Lock className="h-5 w-5 text-primary" />
                    ) : (
                      <Hash className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold truncate">#{channel.name}</h4>
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {channel.category}
                      </Badge>
                      {channel.isPrivate && (
                        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                          Private
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {channel.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{channel.subscriberCount} members</span>
                  </div>

                  {channel.isJoined ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleOpenChannel(channel.id)}
                        className="h-8 text-xs gap-1"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Chat
                      </Button>
                      {channel.isOwner && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInviteChannel(channel)}>Invite</Button>}
                      <Button
                        variant="destructive"
                        size="sm"
                        title={channel.isOwner ? "Channel owners cannot leave their channel" : undefined}
                        disabled={pending || channel.isOwner}
                        onClick={async () => { await toggleJoinChannel(channel.id); }}
                        className="h-8 text-xs min-w-18"
                      >
                        Leave
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={pending}
                        onClick={async () => { await toggleJoinChannel(channel.id); }}
                      className="h-8 text-xs min-w-18"
                    >
                      Join
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {inviteChannel && <InviteMemberDialog key={inviteChannel.id} channel={inviteChannel} onClose={() => setInviteChannel(null)} />}
      {/* Create Channel Dialog */}
      <CreateChannelDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </ScrollArea>
  );
}
