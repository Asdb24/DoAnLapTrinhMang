"use client"

import React, { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useChatFlow } from "@/context/ChatFlowContext"
import { MessageSquare, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  const { conversations, setNewChatDialogOpen } = useChatFlow()
  const router = useRouter()

  useEffect(() => {
    if (conversations.length > 0) {
      router.replace(`/chat/${conversations[0].id}`)
    }
  }, [conversations, router])

  if (conversations.length > 0) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-background">
        <div className="text-xs text-muted-foreground animate-pulse">Loading conversation…</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center bg-background select-none">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <MessageSquare className="h-6 w-6 stroke-1" />
      </div>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">No conversations yet</h2>
        <p className="text-xs text-muted-foreground max-w-xs">
          Start a direct message with a teammate or join a channel to start collaborating.
        </p>
      </div>
      <Button
        size="sm"
        className="mt-2 text-xs gap-1.5"
        onClick={() => setNewChatDialogOpen(true)}
      >
        <MessageSquarePlus className="h-4 w-4" />
        New Message
      </Button>
    </div>
  )
}
