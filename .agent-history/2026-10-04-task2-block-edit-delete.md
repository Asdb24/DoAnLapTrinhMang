# Technical Changelog: Block User, Edit Message, and Soft Delete Message

- **Date:** 2026-10-04 (23:23 UTC+7)
- **Branch:** `feat/gateway-desktop-client`
- **Scope:** Feature implementation of user blocking, message editing, and message soft-deleting across Gateway (RFC 6455), Database schema/migrations, and Next.js / Electron UI.

---

## 1. Architectural Changes

### 1.1 Custom WebSocket Gateway (RFC 6455)
- **File:** `gateway/src/protocol.ts`
  - Added new packet types to `PacketType` and `GatewayPacket`:
    - `EDIT_MSG`: Client request to edit a message content.
    - `MSG_EDITED`: Gateway broadcast packet notifying all room members of updated message content.
    - `DELETE_MSG`: Client request to soft delete / revoke a message.
    - `MSG_DELETED`: Gateway broadcast packet notifying all room members that a message was deleted.
- **File:** `gateway/src/server.ts`
  - Added packet dispatch cases for `EDIT_MSG` and `DELETE_MSG`.
  - Added `handleEditMsg`: broadcasts `MSG_EDITED` with ISO timestamp to all clients in `roomId`.
  - Added `handleDeleteMsg`: broadcasts `MSG_DELETED` with ISO timestamp to all clients in `roomId`.
- **File:** `gateway/test/gateway-e2e.test.mjs`
  - Added test case #5: "Edit and Delete message over gateway broadcast".
  - Verified 11/11 tests passing in ~600ms.
- **Deployment:**
  - Compiled and deployed `dist/*` to Oracle Cloud VPS (`168.138.160.93:/home/ubuntu/chatflow-gateway/dist/`).
  - Reloaded PM2 service `chatflow-gateway` on the live server. Verified 200 OK via `/health`.

---

## 2. Frontend Services & State Management

### 2.1 Gateway Client Service
- **File:** `src/services/gateway-client.ts`
  - Extended client with `editMessage(roomId, messageId, newContent)` and `deleteMessage(roomId, messageId)`.
  - Added event handlers `onMsgEdited` and `onMsgDeleted` to receive real-time edit and delete events.

### 2.2 Domain Types & Messages Service
- **File:** `src/types/index.ts`
  - `MessageType`: added `isDeleted?: boolean`, `isEdited?: boolean`.
  - `Conversation`: added `otherUserId?: string`.
- **File:** `src/services/messages.ts`
  - `hydrate()`: sets `isDeleted: Boolean(row.deleted_at)` and `isEdited: Boolean(row.updated_at && row.created_at && row.updated_at !== row.created_at)`.
- **File:** `src/services/workspace.ts`
  - `mapConversation()`: extracts `otherUserId` for direct conversations.
- **File:** `src/types/database.generated.ts`
  - Declared `delete_message` and `edit_message` function signatures in Supabase types schema.

### 2.3 Context Provider
- **File:** `src/context/ChatFlowContext.tsx`
  - `ChatFlowContextType`: added `blockUser`, `unblockUser`, `deleteMessage`, `editMessage`.
  - Subscribed to `gatewayClient.onMsgEdited` and `gatewayClient.onMsgDeleted` in active room lifecycle effect.
  - Implemented `blockUser`: calls PostgreSQL RPC `set_blocked({ target_user: id, blocked: true })`.
  - Implemented `deleteMessage`: broadcasts `DELETE_MSG` via gateway, applies optimistic state update to messages, and calls `delete_message` RPC.
  - Implemented `editMessage`: broadcasts `EDIT_MSG` via gateway, applies optimistic state update to messages, and calls `edit_message` RPC.

---

## 3. UI Components

### 3.1 Message Presentation & Inline Editing
- **File:** `src/components/chat/MessageItem.tsx`
  - Added soft-deleted message styling: shows *"Tin nhắn đã bị thu hồi"* in a muted container, hiding attachments and reactions.
  - Added `(đã chỉnh sửa)` timestamp annotation when `isEdited` is true.
  - Added hover action buttons for sent messages:
    - **Pencil (Edit):** activates inline textarea with keyboard shortcuts (Enter to save, Esc to cancel) and Save/Cancel buttons.
    - **Trash (Delete):** prompts confirmation and invokes `deleteMessage`.

### 3.2 Contact & Conversation Blocking
- **File:** `src/components/chat/ChatRightSidebar.tsx`
  - Added Block/Unblock toggle button in Quick Actions when viewing direct message conversations.
  - Dynamically updates icon and label (`ShieldAlert` for Block, `ShieldCheck` for Unblock).
- **File:** `src/components/contacts/ContactsView.tsx`
  - Added quick block/unblock action button on every contact card in the Contacts tab.

---

## 4. Database Migrations
- **File:** `supabase/migrations/20261005000000_message_actions.sql`
  - Created `public.delete_message(target_message uuid)` with sender ownership check, setting `deleted_at = clock_timestamp()` and updating preview.
  - Created `public.edit_message(target_message uuid, new_content text)` with content length/empty checks and sender ownership check.
  - Revoked all and granted execute to authenticated role.

---

## 5. Verification & Test Evidence
- **Vitest Frontend Tests:** 101/101 tests passed (`npx vitest run`).
- **Gateway Unit & E2E Tests:** 11/11 tests passed (`npm --prefix gateway test`).
- **Next.js Production Build:** `npm run build` completed successfully with 0 errors.
- **Live Cloud VPS Integration:** `node scripts/test-live-gateway-chat.mjs` passed 100%:
  - Alice & Bob handshake over `wss://168-138-160-93.sslip.io`.
  - Joined room `room_demo_999`.
  - Typing indicator verified.
  - 2-way message send & ACK verified.
  - Real-time message edit broadcast verified.
  - Real-time message delete broadcast verified.
