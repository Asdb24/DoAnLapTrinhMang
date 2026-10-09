"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Hash,
  Inbox,
  Users,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useChatFlow } from "@/context/ChatFlowContext"
import { CreateChannelDialog } from "@/components/channels/CreateChannelDialog"
import { cn } from "@/lib/utils"

type NavSection = "Chats" | "Channels" | "Contacts" | "Settings"
type MessageFilter = "all" | "unread" | "direct" | "group"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const {
    conversations,
    channels,
    contacts,
    activeConversationId,
    openChannelChat,
    startDirectChat,
  } = useChatFlow()

  const { setOpen, setOpenMobile, isMobile } = useSidebar()

  const getRouteSection = (): NavSection => {
    if (pathname.startsWith("/channels")) return "Channels"
    if (pathname.startsWith("/contacts")) return "Contacts"
    if (pathname.startsWith("/settings")) return "Settings"
    return "Chats"
  }

  const [activeSection, setActiveSection] = React.useState<NavSection>(getRouteSection())
  const [searchQuery, setSearchQuery] = React.useState("")
  const [messageFilter, setMessageFilter] = React.useState<MessageFilter>("all")
  const [createChannelOpen, setCreateChannelOpen] = React.useState(false)

  React.useEffect(() => {
    setActiveSection(getRouteSection())
  }, [pathname])

  const navMain = [
    {
      title: "Chats" as NavSection,
      url: "/",
      icon: Inbox,
    },
    {
      title: "Channels" as NavSection,
      url: "/channels",
      icon: Hash,
    },
    {
      title: "Contacts" as NavSection,
      url: "/contacts",
      icon: Users,
    },
  ]

  const totalUnreadCount = React.useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
  }, [conversations])

  const handleNavClick = (section: NavSection, url: string) => {
    setActiveSection(section)
    setOpen(true)
    if (isMobile) {
      router.push(url)
    }
  }

  const filteredConversations = conversations.filter((c) => {
    if (messageFilter === "unread" && c.unreadCount === 0) return false
    if (messageFilter === "direct" && c.type !== "direct") return false
    if (messageFilter === "group" && c.type !== "group") return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
  })

  const filteredChannels = channels.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  })

  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)
  })

  const handleSelectChannel = async (channelId: string) => {
    await openChannelChat(channelId)
    router.push(`/chat/${channelId}`)
    if (isMobile) setOpenMobile(false)
  }

  const handleStartDirectChat = async (contactId: string) => {
    const convId = await startDirectChat(contactId)
    if (convId) {
      router.push(`/chat/${convId}`)
      if (isMobile) setOpenMobile(false)
    }
  }

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="overflow-hidden [&>[data-sidebar=sidebar]]:!flex-row border-r border-border"
        {...props}
      >
        <Sidebar
          collapsible="none"
          className="!w-[calc(var(--sidebar-width-icon)+1px)] shrink-0 border-r border-border bg-sidebar/80"
        >
          <SidebarContent className="pt-3">
            <SidebarGroup>
              <SidebarGroupContent className="px-1.5 md:px-0">
                <SidebarMenu>
                  {navMain.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={{
                          children: item.title,
                          hidden: false,
                        }}
                        aria-label={item.title}
                        onClick={() => handleNavClick(item.title, item.url)}
                        isActive={activeSection === item.title}
                        className={cn(
                          "h-9 w-9 p-0 justify-center rounded-lg mx-auto transition-colors",
                          activeSection === item.title
                            ? "bg-primary/10 text-primary hover:bg-primary/15 font-semibold"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="md:hidden">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-2 pb-3">
            <NavUser />
          </SidebarFooter>
        </Sidebar>

        <Sidebar
          collapsible="none"
          className="hidden md:flex shrink-0 w-[calc(var(--sidebar-width)_-_var(--sidebar-width-icon)_-_1px)] overflow-hidden transition-opacity duration-150 group-data-[collapsible=icon]:opacity-0"
          style={{ width: "calc(var(--sidebar-width) - var(--sidebar-width-icon) - 1px)" }}
        >
          <SidebarHeader className="gap-3 border-b p-3.5">
            <div className="flex w-full items-center justify-between">
              <span className="text-base font-semibold text-foreground tracking-tight">
                {activeSection}
              </span>
            </div>
            <SidebarInput
              id="sidebar-search-input"
              name="search"
              aria-label="Search conversations, channels or contacts"
              placeholder="Type to search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {activeSection === "Chats" && (
              <div
                role="tablist"
                aria-label="Lọc cuộc trò chuyện"
                className="flex items-center gap-1 pt-0.5 overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={messageFilter === "all"}
                  onClick={() => setMessageFilter("all")}
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
                    messageFilter === "all"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={messageFilter === "unread"}
                  onClick={() => setMessageFilter("unread")}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
                    messageFilter === "unread"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>Chưa đọc</span>
                  {totalUnreadCount > 0 && (
                    <span
                      className={cn(
                        "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        messageFilter === "unread"
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {totalUnreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={messageFilter === "direct"}
                  onClick={() => setMessageFilter("direct")}
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
                    messageFilter === "direct"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  Cá nhân
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={messageFilter === "group"}
                  onClick={() => setMessageFilter("group")}
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
                    messageFilter === "group"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  Nhóm
                </button>
              </div>
            )}
          </SidebarHeader>

          <SidebarContent>
            {activeSection === "Chats" && (
              <SidebarGroup className="px-0">
                <SidebarGroupContent>
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      {searchQuery
                        ? "No conversations match your search."
                        : messageFilter === "unread"
                        ? "No unread conversations."
                        : messageFilter === "group"
                        ? "No group conversations."
                        : messageFilter === "direct"
                        ? "No direct conversations."
                        : "No conversations yet."}
                    </div>
                  ) : (
                    filteredConversations.map((conv) => {
                      const isActive = activeConversationId === conv.id
                      return (
                        <Link
                          href={`/chat/${conv.id}`}
                          key={conv.id}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false)
                          }}
                          className={cn(
                            "flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 transition-all",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <span className={cn(isActive ? "font-semibold text-foreground" : "font-medium text-foreground")}>{conv.name}</span>
                            {conv.unreadCount > 0 && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                {conv.unreadCount}
                              </span>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground">{conv.lastMessageTime}</span>
                          </div>
                          <span className="font-medium text-xs">
                            {conv.type === "group" ? `# ${conv.name}` : `@${conv.name.toLowerCase().replace(/\s+/g, "")}`}
                          </span>
                          <span className="line-clamp-2 w-[260px] text-xs whitespace-break-spaces text-muted-foreground">
                            {conv.lastMessage || "No messages yet"}
                          </span>
                        </Link>
                      )
                    })
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {activeSection === "Channels" && (
              <SidebarGroup className="px-0">
                <SidebarGroupContent>
                  {filteredChannels.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No channels match your search.
                    </div>
                  ) : (
                    filteredChannels.map((channel) => {
                      const isActive = activeConversationId === channel.id
                      return (
                        <button
                          key={channel.id}
                          onClick={() => handleSelectChannel(channel.id)}
                          className={cn(
                            "flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 w-full text-left transition-all",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <span className="font-medium">#{channel.name}</span>
                            <span className="ml-auto text-xs">
                              {channel.subscriberCount || 0} members
                            </span>
                          </div>
                          <span className="line-clamp-2 w-[260px] text-xs whitespace-break-spaces text-muted-foreground">
                            {channel.description || "Workspace channel"}
                          </span>
                        </button>
                      )
                    })
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {activeSection === "Contacts" && (
              <SidebarGroup className="px-0">
                <SidebarGroupContent>
                  {filteredContacts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No contacts found.
                    </div>
                  ) : (
                    filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => handleStartDirectChat(contact.id)}
                        className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full text-left"
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="font-medium">{contact.name}</span>
                          <span className="ml-auto text-xs capitalize text-muted-foreground">
                            {contact.presence}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {contact.role || contact.email}
                        </span>
                      </button>
                    ))
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {activeSection === "Settings" && (
              <SidebarGroup className="px-0">
                <SidebarGroupContent>
                  <Link
                    href="/settings"
                    className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <span className="font-medium">All Preferences</span>
                    <span className="text-xs text-muted-foreground">
                      Manage account, notifications and workspace options
                    </span>
                  </Link>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </Sidebar>
      </Sidebar>

      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
      />
    </>
  )
}
