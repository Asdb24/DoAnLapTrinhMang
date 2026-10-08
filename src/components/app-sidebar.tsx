"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Hash,
  MessageSquare,
  MessageSquareCode,
  Plus,
  Settings,
  Users,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import { Label } from "@/components/ui/label"
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
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator"
import { useChatFlow } from "@/context/ChatFlowContext"
import { CreateChannelDialog } from "@/components/channels/CreateChannelDialog"
import { cn } from "@/lib/utils"

type NavSection = "Chats" | "Channels" | "Contacts" | "Settings"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const {
    conversations,
    channels,
    contacts,
    activeConversationId,
    setNewChatDialogOpen,
    openChannelChat,
    startDirectChat,
  } = useChatFlow()

  const { setOpen, setOpenMobile, isMobile } = useSidebar()

  // Determine current active section from route, or allow manual tab switching
  const getRouteSection = (): NavSection => {
    if (pathname.startsWith("/channels")) return "Channels"
    if (pathname.startsWith("/contacts")) return "Contacts"
    if (pathname.startsWith("/settings")) return "Settings"
    return "Chats"
  }

  const [activeSection, setActiveSection] = React.useState<NavSection>(getRouteSection())
  const [searchQuery, setSearchQuery] = React.useState("")
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [createChannelOpen, setCreateChannelOpen] = React.useState(false)

  // Keep section synced when user navigates
  React.useEffect(() => {
    setActiveSection(getRouteSection())
  }, [pathname])

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)

  const navMain = [
    {
      title: "Chats" as NavSection,
      url: "/",
      icon: MessageSquare,
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
    {
      title: "Channels" as NavSection,
      url: "/channels",
      icon: Hash,
      badge: undefined,
    },
    {
      title: "Contacts" as NavSection,
      url: "/contacts",
      icon: Users,
      badge: undefined,
    },
    {
      title: "Settings" as NavSection,
      url: "/settings",
      icon: Settings,
      badge: undefined,
    },
  ]

  const handleNavClick = (section: NavSection, url: string) => {
    setActiveSection(section)
    setOpen(true)
    if (isMobile) {
      router.push(url)
    }
  }

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (unreadOnly && c.unreadCount === 0) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
  })

  // Filter channels
  const filteredChannels = channels.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  })

  // Filter contacts
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
        className="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row"
        {...props}
      >
        {/* First Sidebar: Collapsed Icon Rail */}
        <Sidebar
          collapsible="none"
          className="!w-[calc(var(--sidebar-width-icon)+1px)] border-r"
        >
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
                  <Link href="/" title="ChatFlow Workspace">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                      <MessageSquareCode className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">ChatFlow</span>
                      <span className="truncate text-xs text-muted-foreground">Workspace</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent className="px-1.5 md:px-0">
                <SidebarMenu>
                  {navMain.map((item) => {
                    const isItemActive = activeSection === item.title
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          tooltip={{
                            children: item.title,
                            hidden: false,
                          }}
                          onClick={() => handleNavClick(item.title, item.url)}
                          isActive={isItemActive}
                          className="relative px-2.5 md:px-2"
                          aria-label={item.title}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {item.badge !== undefined && (
                            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <NavUser />
          </SidebarFooter>
        </Sidebar>

        {/* Second Sidebar: Sub-items list (Chats / Channels / Contacts / Settings) */}
        <Sidebar collapsible="none" className="hidden flex-1 md:flex">
          <SidebarHeader className="gap-3.5 border-b p-4">
            <div className="flex w-full items-center justify-between">
              <div className="text-base font-semibold text-foreground">
                {activeSection}
              </div>

              {activeSection === "Chats" && (
                <div className="flex items-center gap-2">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <span>Unreads</span>
                    <Switch
                      checked={unreadOnly}
                      onCheckedChange={setUnreadOnly}
                      className="shadow-none scale-75"
                      aria-label="Filter unread conversations"
                    />
                  </Label>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setNewChatDialogOpen(true)}
                    title="New Direct Message"
                    aria-label="New Direct Message"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {activeSection === "Channels" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setCreateChannelOpen(true)}
                  title="Create Channel"
                  aria-label="Create Channel"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            <SidebarInput
              placeholder={
                activeSection === "Chats"
                  ? "Search conversations..."
                  : activeSection === "Channels"
                  ? "Search channels..."
                  : activeSection === "Contacts"
                  ? "Search contacts..."
                  : "Type to search..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SidebarHeader>

          <SidebarContent>
            {/* Chats section */}
            {activeSection === "Chats" && (
              <SidebarGroup className="px-0">
                <SidebarGroupContent>
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      {searchQuery
                        ? "No conversations match your search."
                        : unreadOnly
                        ? "No unread conversations."
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
                            "flex flex-col items-start gap-1.5 border-b p-3.5 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                            isActive &&
                              "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <div className="relative shrink-0">
                              <Avatar className="h-7 w-7 rounded-md border border-border/50">
                                <AvatarImage src={conv.avatar} alt={conv.name} />
                                <AvatarFallback className="rounded-md text-[10px] font-semibold bg-secondary text-secondary-foreground">
                                  {conv.type === "group" ? (
                                    <Users className="h-3 w-3" />
                                  ) : (
                                    conv.name.slice(0, 2).toUpperCase()
                                  )}
                                </AvatarFallback>
                              </Avatar>
                              {conv.type === "direct" && conv.presence && (
                                <span className="absolute -bottom-0.5 -right-0.5">
                                  <UserStatusIndicator
                                    status={conv.presence}
                                    size="sm"
                                  />
                                </span>
                              )}
                            </div>
                            <span className="font-semibold truncate text-sm flex-1">
                              {conv.name}
                            </span>
                            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                              {conv.lastMessageTime}
                            </span>
                          </div>

                          <div className="flex w-full items-center justify-between gap-2 pl-9">
                            <span className="line-clamp-2 w-[220px] text-xs whitespace-break-spaces text-muted-foreground">
                              {conv.lastMessage || "No messages yet"}
                            </span>
                            {conv.unreadCount > 0 && (
                              <Badge
                                variant="default"
                                className="h-4 min-w-4 px-1 text-[10px] font-bold rounded-full shrink-0 flex items-center justify-center"
                              >
                                {conv.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </Link>
                      )
                    })
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Channels section */}
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
                            "flex flex-col items-start gap-1.5 border-b p-3.5 text-sm leading-tight last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full text-left",
                            isActive &&
                              "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-semibold truncate text-sm flex-1">
                              {channel.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 font-normal"
                            >
                              {channel.subscriberCount || 0}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground line-clamp-2 w-[240px] pl-6">
                            {channel.description || "Workspace channel"}
                          </span>
                        </button>
                      )
                    })
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Contacts section */}
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
                        className="flex items-center gap-2.5 border-b p-3 text-sm last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full text-left"
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-8 w-8 rounded-md border border-border/50">
                            <AvatarImage src={contact.avatar} alt={contact.name} />
                            <AvatarFallback className="rounded-md text-[11px] font-semibold bg-secondary text-secondary-foreground">
                              {contact.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="absolute -bottom-0.5 -right-0.5">
                            <UserStatusIndicator
                              status={contact.presence}
                              size="sm"
                            />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs truncate leading-tight">
                            {contact.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                            {contact.role}
                          </p>
                        </div>
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Settings section */}
            {activeSection === "Settings" && (
              <SidebarGroup className="px-2 py-3">
                <SidebarGroupContent>
                  <div className="space-y-1">
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium hover:bg-sidebar-accent transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      All Settings
                    </Link>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </Sidebar>
      </Sidebar>

      {/* Dialog for creating a new channel */}
      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
      />
    </>
  )
}
