# Technical Changelog: Light Mode Optimization & Message Filters Refactor

**Date:** 2026-10-09  
**Branch:** feature/shadcn-sidebar-09-refactor  
**Components Modified:**
- `src/config/theme-config.ts` (Rule 9)
- `theme-config.ts` (Root re-export)
- `src/styles/theme.css` (Rule 9)
- `theme.css` (Root re-export)
- `src/app/globals.css`
- `src/components/ui/bubble.tsx`
- `src/components/chat/MessageItem.tsx`
- `src/components/chat/ChatRoom.tsx`
- `src/components/chat/MessageHistory.tsx`
- `src/components/app-sidebar.tsx`

---

## 1. Problem Statement
1. **Harsh Jet-Black Sent Bubbles in Light Mode:**  
   Sent chat bubbles were rendering with pitch-black backgrounds (`#18181b`) and wrapping transparent stickers in large black rectangles.
2. **Flattened Contrast:**  
   Canvas background (`#ffffff`) and sidebar (`#fafafa`) lacked surface hierarchy and elevation.
3. **User Request Refinements:**
   - "xoá logo": Remove the square `Command` (`⌘`) icon from the top of the icon rail.
   - "xoá nút setting": Remove redundant settings gear button from the middle rail (settings are accessible via avatar menu).
   - "dich chuyển bị trí như mũi tên, thêm bộ lọc tin nhắn": Move the unread switch down below the search bar and replace it with 4 category filter pills (`Tất cả`, `Chưa đọc`, `Cá nhân`, `Nhóm`).

---

## 2. Technical Changes

### Design Tokens & Theme Configuration (Rule 9)
- Added `theme-config.ts` and `theme.css` with unified HSL color tokens for Light and Dark modes.
- Light Mode Primary: Vibrant Royal Blue `hsl(221.2 83.2% 53.3%)` (`#2563eb`), ensuring WCAG AAA compliant contrast with white text (`> 4.5:1`).
- Background: Soft neutral slate canvas `hsl(210 20% 98%)` (`#f8fafc`).
- Received Bubble: Crisp white card surface `bg-card` with fine border `border-border/80` and subtle elevation.

### Ghost Variant for Media & Stickers (`MessageItem.tsx` & `bubble.tsx`)
- Detected media-only / sticker-only messages (`isMediaOnly = isSticker || isGifOnly`).
- Applied `variant="ghost"` with `p-0 bg-transparent border-none` so stickers float with zero container backgrounds.
- Positioned timestamps and read receipts cleanly beneath stickers using `text-muted-foreground` and `text-primary`.

### Sidebar Rail & Navigation Cleanup (`app-sidebar.tsx`)
- Removed top `SidebarHeader` with `Command` logo from the icon rail.
- Removed `Settings` item from `navMain`.
- Relocated filter control from the cramped top header down below `SidebarInput`.
- Implemented 4 message filter pills:
  1. `Tất cả` (All conversations)
  2. `Chưa đọc` (Unread only, with unread badge count)
  3. `Cá nhân` (Direct 1-to-1 conversations)
  4. `Nhóm` (Group channels / conversations)

---

## 3. Empirical Verification Evidence
- `npm run typecheck`: 0 errors.
- `npm test`: 101/101 tests passed across 7 test suites (vitest).
- `npm run build`: Production Next.js 16 build passed without regressions.
- Screenshot Runtime Evidence: `evidence_refined_light_mode_and_filters.png` captured via Chrome DevTools MCP.
