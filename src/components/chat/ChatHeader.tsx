"use client";

import React from "react";
import Link from "next/link";
import { Conversation } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator";
import {
  Phone,
  Video,
  PanelRight,
  Users,
  ArrowLeft,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatHeaderProps {
  conversation: Conversation;
  showDetails: boolean;
  setShowDetails: (show: boolean) => void;
}

export function ChatHeader({
  conversation,
  showDetails,
  setShowDetails,
}: ChatHeaderProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <header className="h-16 px-4 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between shrink-0 select-none">
        {/* Recipient / Group Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href="/"
            className="md:hidden p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Back to messages"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarImage src={conversation.avatar} alt={conversation.name} />
              <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold text-xs">
                {conversation.type === "group" ? (
                  <Users className="h-4 w-4" />
                ) : (
                  conversation.name.slice(0, 2).toUpperCase()
                )}
              </AvatarFallback>
            </Avatar>
            {conversation.type === "direct" && conversation.presence && (
              <span className="absolute bottom-0 right-0">
                <UserStatusIndicator status={conversation.presence} size="sm" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold truncate leading-none">
                {conversation.name}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {conversation.type === "group"
                ? `${conversation.membersCount ?? 0} members`
                : conversation.presence
                ? `${conversation.presence.charAt(0).toUpperCase() + conversation.presence.slice(1)}`
                : "Offline"}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                disabled
                title="Voice calls are not available yet"
                aria-label="Voice Call (unavailable)"
              >
                <Phone className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Voice calls are not available yet</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                disabled
                title="Video calls are not available yet"
                aria-label="Video Call (unavailable)"
              >
                <Video className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Video calls are not available yet</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showDetails ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setShowDetails(!showDetails)}
                aria-label="Toggle Details Sidebar"
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showDetails ? "Hide Conversation Details" : "View Conversation Details"}
            </TooltipContent>
          </Tooltip>
        </div>

      </header>
    </TooltipProvider>
  );
}
