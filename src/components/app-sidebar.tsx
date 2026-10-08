"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Command,
  Hash,
  Inbox,
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
  const [unreadOnly, setUnreadOnly] = React.useState(false)
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
    {
      title: "Settings" as NavSection,
      url: "/settings",
      icon: Settings,
    },
  ]

  const handleNavClick = (section: NavSection, url: string) => {
    setActiveSection(section)
    setOpen(true)
    if (isMobile) {
      router.push(url)
    }
  }

  const filteredConversations = conversations.filter((c) => {
    if (unreadOnly && c.unreadCount === 0) return false
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
        className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
        {...props}
      >
        {/* First Sidebar: Icon Rail */}
        <Sidebar
          collapsible="none"
          className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
        >
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
                  <a href="#">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <Command className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">ChatFlow</span>
                      <span className="truncate text-xs">Workspace</span>
                    </div>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
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
                        onClick={() => handleNavClick(item.title, item.url)}
                        isActive={activeSection === item.title}
                        className="px-2.5 md:px-2"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <NavUser />
          </SidebarFooter>
        </Sidebar>

        {/* Second Sidebar: Item list */}
        <Sidebar collapsible="none" className="hidden flex-1 md:flex">
          <SidebarHeader className="gap-3.5 border-b p-4">
            <div className="flex w-full items-center justify-between">
              <div className="text-base font-medium text-foreground">
                {activeSection}
              </div>
              {activeSection === "Chats" && (
                <Label className="flex items-center gap-2 text-sm">
                  <span>Unreads</span>
                  <Switch
                    checked={unreadOnly}
                    onCheckedChange={setUnreadOnly}
                    className="shadow-none"
                  />
                </Label>
              )}
            </div>
            <SidebarInput
              placeholder="Type to search..."
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
                            "flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive &&
                              "bg-sidebar-accent text-sidebar-accent-foreground"
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <span>{conv.name}</span>
                            <span className="ml-auto text-xs">{conv.lastMessageTime}</span>
                          </div>
                          <span className="font-medium">
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
                            "flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full text-left",
                            isActive &&
                              "bg-sidebar-accent text-sidebar-accent-foreground"
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

            {/* Settings section */}
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
