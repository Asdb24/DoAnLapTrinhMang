# Technical Changelog: Shadcn UI Sidebar-09 Refactor & Backend Integration

- **Date:** 2026-10-08
- **Branch:** `feature/shadcn-sidebar-09-refactor`
- **Objective:** Eliminate legacy generic UI sidebars, adopt shadcn `sidebar-09` dual-sidebar architecture, purge all mock data (William Smith, email stubs), and integrate 100% with live Supabase & WebSocket Gateway state.

## 1. Architectural Changes
1. **Installed Shadcn Sidebar-09 Primitives**:
   - `src/components/ui/sidebar.tsx`
   - `src/components/ui/breadcrumb.tsx`
   - `src/components/ui/sheet.tsx`
   - `src/components/ui/collapsible.tsx`
   - `src/components/ui/skeleton.tsx`
   - `src/hooks/use-mobile.tsx`
2. **Purged Legacy Generic UI**:
   - Deleted `src/components/layout/LeftMainSidebar.tsx` (the generic icon bar with sparkles and clip-art icon styling).
   - Removed secondary sidebar duplication in `src/app/page.tsx` and `src/app/chat/[id]/page.tsx`.
   - Removed temporary scaffolding `src/app/dashboard/`.
3. **Dual Sidebar Architecture (`AppSidebar` & `NavUser`)**:
   - **Primary Rail (Icon Sidebar)**:
     - Header: ChatFlow branding (`MessageSquareCode` with slate tokens).
     - Navigation items: Chats, Channels, Contacts, Settings with active route awareness and total unread badge.
     - Footer: `NavUser` connected to live user settings (`displayName`, `avatar`, `presence`, theme toggle, logout).
   - **Secondary Rail (Sub-list Sidebar)**:
     - Dynamic views for Chats (with unread switch filter and live message preview), Channels (with subscriber badge and create channel dialog), Contacts (with presence and direct message initiation), and Settings.
     - Zero mock data: Completely removed mock email objects (`data.mails`, `William Smith`, etc.).
4. **Header & Inset Navigation (`AppHeader`)**:
   - Integrated dynamic breadcrumb navigation (`ChatFlow > Section > Item`).
   - Live WebSocket Gateway status indicator (`Live`, `Connecting`, `Offline`).
5. **Layout Unification (`RootLayout`)**:
   - RootLayout now wraps the viewport in `<SidebarProvider>` with `--sidebar-width: 350px`.
   - Embeds `<AppSidebar />` and `<SidebarInset>` seamlessly.

## 2. Dual-Sidebar Flex-Row Fix for Tailwind v3 Compatibility
1. **Root Cause Analysis**:
   - The upstream shadcn `sidebar-09` was authored using Tailwind v4 syntax: `*:data-[sidebar=sidebar]:flex-row` and `w-[calc(var(--sidebar-width-icon)+1px)]!`.
   - The project uses Tailwind CSS v3.4.16 (`tailwindcss: "^3.4.16"`).
   - In Tailwind v3, `*:` is unrecognized, and trailing `!` is invalid syntax. Consequently, the outer sidebar inner container defaulted to `flex-col`, and the first sidebar defaulted to `350px` width.
   - Result: The two sidebars stacked vertically instead of rendering side-by-side.
2. **Resolution**:
   - In `src/components/app-sidebar.tsx`:
     - Changed outer sidebar class to `overflow-hidden [&>[data-sidebar=sidebar]]:!flex-row`.
     - Changed first sidebar class to `!w-[calc(var(--sidebar-width-icon)+1px)] shrink-0 border-r`.
     - In the icon rail header, menu buttons, and footer: added `md:hidden` to labels and chevrons so only the 32px icons and user avatar render cleanly without spilling into adjacent columns.
     - Added `min-w-0` to the second sidebar to prevent flexbox blowout.
   - In `src/components/nav-user.tsx`:
     - Added `md:hidden` to the user info grid and `ChevronsUpDown` icon inside the sidebar trigger.

## 4. Message & Bubble Components and Header Streamlining
1. **Shadcn Message & Bubble Primitives**:
   - Added `src/components/ui/message.tsx` (`MessageGroup`, `Message`, `MessageAvatar`, `MessageContent`, `MessageHeader`, `MessageFooter`).
   - Added `src/components/ui/bubble.tsx` (`BubbleGroup`, `Bubble`, `BubbleContent`, `BubbleReactions`).
   - Refactored `src/components/chat/MessageItem.tsx` to cleanly compose `Message`, `MessageAvatar`, `MessageContent`, and `Bubble`.
   - Updated `src/components/chat/MessageHistory.tsx` to stack consecutive messages from the same sender using `MessageGroup`.
2. **Purged Redundant Breadcrumb Header**:
   - Removed duplicated `AppHeader` (`src/components/layout/AppHeader.tsx`) which took up wasted vertical space with redundant breadcrumbs.
   - Integrated `SidebarTrigger` directly into primary view headers (`ChatHeader`, `ChannelsView`, `ContactsView`, `SettingsView`).
   - Enhanced `useSidebar` hook in `src/components/ui/sidebar.tsx` with resilient default fallbacks when rendered outside `SidebarProvider`.

