"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { useChatFlow } from "@/context/ChatFlowContext"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export function AppHeader() {
  const pathname = usePathname()
  const { conversations, realtimeStatus } = useChatFlow()

  let section = "Chats"
  let itemTitle: string | null = null

  if (pathname.startsWith("/channels")) {
    section = "Channels"
  } else if (pathname.startsWith("/contacts")) {
    section = "Contacts"
  } else if (pathname.startsWith("/settings")) {
    section = "Settings"
  } else if (pathname.startsWith("/chat/")) {
    const id = pathname.replace("/chat/", "")
    const conv = conversations.find((c) => c.id === id)
    if (conv) itemTitle = conv.name
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur-xs">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/">ChatFlow</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              {itemTitle ? (
                <BreadcrumbLink href={section === "Channels" ? "/channels" : "/"}>
                  {section}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{section}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {itemTitle && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-medium truncate max-w-[200px]">
                    {itemTitle}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
          <span
            className={`h-2 w-2 rounded-full ${
              realtimeStatus === "SUBSCRIBED"
                ? "bg-emerald-500"
                : realtimeStatus === "CONNECTING"
                ? "bg-amber-500 animate-pulse"
                : "bg-muted-foreground"
            }`}
          />
          <span className="hidden sm:inline">
            {realtimeStatus === "SUBSCRIBED"
              ? "Live"
              : realtimeStatus === "CONNECTING"
              ? "Connecting"
              : "Offline"}
          </span>
        </span>
      </div>
    </header>
  )
}
