"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChatFlow } from "@/context/ChatFlowContext";
import {
  MessageSquare,
  Hash,
  Users,
  Settings,
  Plus,
  Sparkles,
  Sun,
  Moon,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LeftMainSidebar() {
  const pathname = usePathname();
  const {
    settings,
    updateSettings,
    setNewChatDialogOpen,
    conversations,
    logout,
    pending,
  } = useChatFlow();

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  const navItems = [
    {
      label: "Chats",
      href: "/",
      icon: MessageSquare,
      badge: totalUnread > 0 ? totalUnread : undefined,
      isActive: pathname === "/" || pathname.startsWith("/chat"),
    },
    {
      label: "Channels",
      href: "/channels",
      icon: Hash,
      isActive: pathname.startsWith("/channels"),
    },
    {
      label: "Contacts",
      href: "/contacts",
      icon: Users,
      isActive: pathname.startsWith("/contacts"),
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
      isActive: pathname.startsWith("/settings"),
    },
  ];

  const toggleTheme = async () => {
    await updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" });
  };

  return (
    <aside className="w-16 md:w-18 flex flex-col items-center justify-between py-3 border-r bg-card text-card-foreground shrink-0 select-none z-20">
      <TooltipProvider delayDuration={150}>
        {/* Top: Logo & New Message */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Logo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/"
                className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm hover:opacity-95 transition-opacity"
              >
                <Sparkles className="h-6 w-6" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">ChatFlow Workspace</TooltipContent>
          </Tooltip>

          {/* Quick Action: New Message */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="default"
                className="h-10 w-10 rounded-xl shadow-sm"
                onClick={() => setNewChatDialogOpen(true)}
                aria-label="New Message"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Message</TooltipContent>
          </Tooltip>

          <div className="w-8 h-px bg-border my-1" />

          {/* Nav Items */}
          <nav className="flex flex-col items-center gap-2 w-full px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={`relative flex items-center justify-center h-10 w-10 rounded-xl transition-colors ${
                        item.isActive
                          ? "bg-secondary text-foreground font-semibold shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {item.badge !== undefined && (
                        <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Theme Toggle & User Profile */}
        <div className="flex flex-col items-center gap-3 w-full px-2">
          {/* Theme Quick Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                disabled={pending} onClick={toggleTheme}
                aria-label="Toggle Theme"
              >
                {settings.theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Switch to {settings.theme === "dark" ? "Light" : "Dark"} Mode
            </TooltipContent>
          </Tooltip>

          {/* User Profile Avatar with Presence */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="User menu"
              >
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarImage src={settings.avatar} alt={settings.displayName} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">
                    {settings.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0">
                  <UserStatusIndicator status={settings.presence || "online"} size="sm" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{settings.displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">{settings.email}</p>
                  <p className="text-xs text-muted-foreground italic pt-1">
                    "{settings.statusMessage}"
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground py-1">
                Presence Status
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={pending}
                onClick={async () => { await updateSettings({ presence: "online" }); }}
                className="cursor-pointer flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2">
                  <UserStatusIndicator status="online" size="sm" />
                  <span>Online</span>
                </span>
                {settings.presence === "online" && <span className="text-[10px] text-primary">Active</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onClick={async () => { await updateSettings({ presence: "away" }); }}
                className="cursor-pointer flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2">
                  <UserStatusIndicator status="away" size="sm" />
                  <span>Away</span>
                </span>
                {settings.presence === "away" && <span className="text-[10px] text-primary">Active</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onClick={async () => { await updateSettings({ presence: "offline" }); }}
                className="cursor-pointer flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2">
                  <UserStatusIndicator status="offline" size="sm" />
                  <span>Offline</span>
                </span>
                {settings.presence === "offline" && <span className="text-[10px] text-primary">Active</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Preferences</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                {settings.theme === "dark" ? (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark Mode</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={pending}
                onClick={async () => { await logout(); }}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </aside>
  );
}
