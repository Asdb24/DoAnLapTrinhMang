"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useChatFlow } from "@/context/ChatFlowContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquarePlus, Check } from "lucide-react";

export function NewMessageDialog() {
  const { newChatDialogOpen, setNewChatDialogOpen, contacts, startDirectChat, pending, error } = useChatFlow();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const router = useRouter();

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartChat = async () => {
    if (!selectedContactId || pending) return;
    const conversationId = await startDirectChat(selectedContactId);
    if (!conversationId) return;
    setNewChatDialogOpen(false);
    setSelectedContactId(null);
    setSearchQuery("");
    if (conversationId) {
      router.push(`/chat/${conversationId}`);
    }
  };

  return (
    <Dialog open={newChatDialogOpen} onOpenChange={value => { if (!pending) setNewChatDialogOpen(value); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            New Direct Message
          </DialogTitle>
          <DialogDescription>
            Select a team member to start a direct conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search colleagues by name or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[280px] pr-2">
            <div className="space-y-1">
              {filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No teammates found matching "{searchQuery}"
                </div>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = selectedContactId === contact.id;
                  return (
                    <div
                      key={contact.id}
                      onClick={() => { if (!pending) setSelectedContactId(contact.id); }}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors border ${
                        isSelected
                          ? "bg-accent border-primary/40 text-accent-foreground"
                          : "border-transparent hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={contact.avatar} alt={contact.name} />
                            <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">
                              {contact.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="absolute bottom-0 right-0">
                            <UserStatusIndicator status={contact.presence} size="sm" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-none truncate">
                            {contact.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {contact.role}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setNewChatDialogOpen(false);
              setSelectedContactId(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartChat}
            disabled={pending || !selectedContactId}
            className="gap-2"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {pending ? "Opening…" : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
