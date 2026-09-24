"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserStatusIndicator, UserStatusBadge } from "@/components/common/UserStatusIndicator";
import { Search, MessageSquare, Mail, UserPlus, Users } from "lucide-react";

export function ContactsView() {
  const { contacts, startDirectChat, pending } = useChatFlow();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online">("all");
  const router = useRouter();

  const filteredContacts = contacts.filter((contact) => {
    const matchesQuery =
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || contact.presence === "online";
    return matchesQuery && matchesStatus;
  });

  const handleStartChat = async (contactId: string) => {
    if (pending) return;
    const convId = await startDirectChat(contactId);
    if (convId) {
      router.push(`/chat/${convId}`);
    }
  };

  return (
    <ScrollArea className="flex-1 h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card/40 px-6 py-6 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Colleagues & Contacts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Find colleagues, see their status, and start a conversation.
            </p>
          </div>
          <Button
            disabled={pending}
            onClick={() => {
              const firstOnline = contacts.find((c) => c.presence === "online");
              if (firstOnline) handleStartChat(firstOnline.id);
            }}
            className="gap-2 shrink-0 self-start sm:self-auto shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Quick Connect
          </Button>
        </div>

        {/* Filter and Search */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search colleagues by name, role, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className="text-xs"
            >
              All ({contacts.length})
            </Button>
            <Button
              variant={statusFilter === "online" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("online")}
              className="text-xs gap-1.5"
            >
              <span className="h-2 w-2 rounded-full bg-primary" />
              Online ({contacts.filter((c) => c.presence === "online").length})
            </Button>
          </div>
        </div>
      </div>

      {/* Contacts Grid */}
      <div className="p-6 sm:p-8 flex-1">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No contacts match your query.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((contact) => (
              <Card
                key={contact.id}
                className="flex flex-col justify-between border-border bg-card/60 hover:bg-card transition-colors hover:shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12 border-2 border-border">
                        <AvatarImage src={contact.avatar} alt={contact.name} />
                        <AvatarFallback className="font-bold bg-secondary text-secondary-foreground">
                          {contact.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0">
                        <UserStatusIndicator status={contact.presence} size="sm" />
                      </span>
                    </div>

                    <UserStatusBadge status={contact.presence} />
                  </div>

                  <div className="space-y-1 mt-3">
                    <CardTitle className="text-base font-bold">{contact.name}</CardTitle>
                    <p className="text-xs text-primary font-medium">{contact.role}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </p>
                  </div>

                  <CardDescription className="text-xs line-clamp-2 mt-2 leading-relaxed">
                    {contact.bio}
                  </CardDescription>

                  {contact.customStatus && (
                    <div className="mt-2 text-[11px] text-muted-foreground italic bg-muted/40 px-2 py-1 rounded">
                      "{contact.customStatus}"
                    </div>
                  )}
                </CardHeader>

                <CardFooter className="pt-2 border-t">
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full gap-2 text-xs"
                    disabled={pending}
                    onClick={() => handleStartChat(contact.id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Direct Message
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
