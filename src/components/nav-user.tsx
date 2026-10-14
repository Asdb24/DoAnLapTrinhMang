"use client"

import * as React from "react"
import Link from "next/link"
import {
  ChevronsUpDown,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react"
import { motion } from "motion/react"
import { spring } from "@/lib/springs"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useChatFlow } from "@/context/ChatFlowContext"
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator"

export function NavUser() {
  const { currentUser, settings, updateSettings, logout, pending } = useChatFlow()
  const { isMobile } = useSidebar()

  const displayName = settings?.displayName || currentUser?.email?.split("@")[0] || "User"
  const email = currentUser?.email || ""
  const avatar = settings?.avatar || ""
  const initials = displayName.slice(0, 2).toUpperCase()
  const isDark = settings?.theme === "dark"

  const handleToggleTheme = async () => {
    if (pending) return
    await updateSettings({ theme: isDark ? "light" : "dark" })
  }

  const handleLogout = async () => {
    if (pending) return
    await logout()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={{
                children: displayName,
                hidden: false,
              }}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground md:h-9 md:w-9 md:p-0 md:justify-center md:mx-auto rounded-lg"
              aria-label="User account menu"
            >
              <Avatar className="h-8 w-8 rounded-lg border border-border/80 shadow-2xs">
                <AvatarImage src={avatar} alt={displayName} />
                <AvatarFallback className="rounded-lg text-xs font-semibold bg-secondary text-secondary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight md:hidden">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 md:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={avatar} alt={displayName} />
                  <AvatarFallback className="rounded-lg text-xs font-semibold bg-secondary text-secondary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Account Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleTheme} className="cursor-pointer">
                <span className="grid mr-2 w-4 h-4 shrink-0">
                  <motion.span
                    className="col-start-1 row-start-1 flex items-center justify-center"
                    initial={false}
                    animate={isDark ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                    transition={isDark ? { type: "tween", duration: spring.fast.duration, ease: "easeOut" } : spring.fast.exit}
                  >
                    <Sun className="h-4 w-4" />
                  </motion.span>
                  <motion.span
                    className="col-start-1 row-start-1 flex items-center justify-center"
                    initial={false}
                    animate={isDark ? { opacity: 0, scale: 0.6, filter: "blur(4px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
                    transition={isDark ? spring.fast.exit : { type: "tween", duration: spring.fast.duration, ease: "easeOut" }}
                  >
                    <Moon className="h-4 w-4" />
                  </motion.span>
                </span>
                <span>{isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={pending}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
