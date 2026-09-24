"use client";

import React from "react";
import Link from "next/link";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquarePlus,
  Hash,
  Sparkles,
  ShieldCheck,
  Zap,
  Smile,
} from "lucide-react";

export function WelcomeView() {
  const { setNewChatDialogOpen, settings } = useChatFlow();

  return (
    <ScrollArea className="hidden md:flex flex-1 h-full bg-background select-none">
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-full">
        <div className="max-w-md w-full space-y-6 my-auto">
        {/* Modern Icon Badge */}
        <div className="mx-auto h-20 w-20 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center shadow-sm">
          <Sparkles className="h-10 w-10 text-primary" />
        </div>

        {/* Welcome Text */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back, {settings.displayName.split(" ")[0]}!
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select a conversation from the sidebar to continue collaborating, or start a brand-new discussion with your team.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={() => setNewChatDialogOpen(true)}
            className="w-full sm:w-auto gap-2"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Start New Chat
          </Button>
          <Button
            variant="outline"
            asChild
            className="w-full sm:w-auto gap-2"
          >
            <Link href="/channels">
              <Hash className="h-4 w-4" />
              Explore Channels
            </Link>
          </Button>
        </div>

        {/* Feature Highlights Bento/Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 text-left">
          <Card className="bg-card/50 border-border">
            <CardContent className="p-4 space-y-1.5">
              <Zap className="h-5 w-5 text-primary mb-1" />
              <h3 className="text-xs font-semibold">Stay Connected</h3>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Saved conversations, with new messages appearing as you work.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border">
            <CardContent className="p-4 space-y-1.5">
              <Smile className="h-5 w-5 text-primary mb-1" />
              <h3 className="text-xs font-semibold">Reactions</h3>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Quick emoji feedback & rich file attachments.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border">
            <CardContent className="p-4 space-y-1.5">
              <ShieldCheck className="h-5 w-5 text-primary mb-1" />
              <h3 className="text-xs font-semibold">Member Access</h3>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Keep private channel conversations between invited teammates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </ScrollArea>
  );
}
