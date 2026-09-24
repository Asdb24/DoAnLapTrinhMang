"use client";

import { useState } from "react";
import type { Channel } from "@/types";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InviteMemberDialog({ channel, onClose }: { channel: Channel | null; onClose: () => void }) {
  const { contacts, inviteMember, pending, error } = useChatFlow();
  const [query, setQuery] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const matching = contacts.filter(contact => `${contact.name} ${contact.email}`.toLowerCase().includes(query.toLowerCase()));
  return <Dialog open={!!channel} onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader><DialogTitle>Invite to #{channel?.name}</DialogTitle><DialogDescription>Add a teammate to this channel so they can join the conversation.</DialogDescription></DialogHeader>
      <Input aria-label="Search teammates to invite" placeholder="Search by name or email…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="max-h-72 overflow-y-auto space-y-2">
        {matching.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No teammates found.</p>}
        {matching.map(contact => <div key={contact.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{contact.name}</p><p className="truncate text-xs text-muted-foreground">{contact.email}</p></div>
          <Button size="sm" variant="outline" disabled={pending || invited.includes(contact.id)} aria-label={`Invite ${contact.name}`} onClick={async () => {
            if (channel && await inviteMember(channel.id, contact.id)) setInvited(previous => [...previous, contact.id]);
          }}>{invited.includes(contact.id) ? "Added" : "Invite"}</Button>
        </div>)}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant="secondary" disabled={pending} onClick={onClose}>Done</Button>
    </DialogContent>
  </Dialog>;
}
