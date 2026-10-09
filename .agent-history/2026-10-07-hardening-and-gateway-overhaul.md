# Technical Changelog: Hardening, Gateway Overhaul & Desktop Client

**Date:** 2026-10-07  
**Milestone:** DoAnLapTrinhMang ChatFlow Production Hardening  
**Target Branches Merged:**
- `feat/step-1-gateway-security-hardening` -> PR #6 (Merged `22715a1`)
- `feat/step-2-architecture-gateway-authoritative` -> PR #7 (Merged `961a99c`)
- `feat/step-3-fix-functional-bugs` -> PR #8 (Merged `d285220`)
- `feat/step-4-electron-desktop-standalone` -> PR #9 (Merged `ca92e76`)

---

## 1. Summary of Changes

### Bước 1: Gateway Security Hardening (Merged PR #6)
- **Native JWT Verification:** Replaced unverified header tokens with native Node.js HMAC-SHA256 signature verification matching Supabase `JWT_SECRET`.
- **Room Authorization Guard:** Users cannot send messages to rooms without joining first (`NOT_IN_ROOM` error code).
- **Edit/Delete Ownership Guard:** Verifies sender ownership on `EDIT_MESSAGE` and `DELETE_MESSAGE` frames before broadcasting (`FORBIDDEN` error code).
- **Sliding-Window Rate Limiting:** Enforced max 10 messages per 5 seconds per client connection with automatic connection termination on abuse.
- **Frame Size Protection:** Dropped raw websocket frames exceeding 64 KB with socket disconnect to guard against payload denial-of-service.
- **Verification:** 11/11 Gateway security E2E tests passing.

### Bước 2: Gateway Authoritative Message Sync (Merged PR #7)
- **Authoritative Flow:** Client calls PostgreSQL RPC `send_message` first to acquire an authoritative UUID and `created_at` timestamp.
- **Server Message Correlation:** Gateway broadcasts payload carrying `serverMsgId: row.id` and `createdAt: row.created_at`.
- **Sidebar Previews & Counter Updates:** Inbound messages automatically update conversation previews and increment unread counts across all non-active rooms in real time.
- **Verification:** Live test on Oracle Cloud VPS (`wss://168-138-160-93.sslip.io`) confirmed bidirectional delivery with server UUID correlation.

### Bước 3: Functional Bugs & Audit Integrity (Merged PR #8)
- **Soft-Delete Audit Compliance:** `delete_message` RPC marks `deleted_at = clock_timestamp()` while preserving original text in the database table for compliance and audit requirements.
- **Message Edit Timestamp:** Added `edited_at timestamptz` column to `messages` schema. `edit_message` RPC populates `edited_at = clock_timestamp()`.
- **Client Hydration:** `isEdited` evaluates `row.edited_at`. Deleted message contents display as `'Message deleted'` in client UI while raw DB rows retain historical data.
- **Attachment Metadata:** Preserved exact `bytes` and `mimeType` in `MessageAttachment` interface, `uploadAttachment`, and `sendMessage`.
- **Error Propagation:** Eliminated silent error swallowing in `ChatFlowContext.tsx` (`deleteMessage` and `editMessage`) so unauthorized operations trigger user notifications.
- **Verification:** 232/232 PostgreSQL assertions passing; 101/101 Vitest unit & integration tests passing.

### Bước 4: Desktop Client Standalone Architecture (Merged PR #9)
- **Standalone Node Spawning:** Configured `ELECTRON_RUN_AS_NODE: '1'` when spawning child processes via `process.execPath`, preventing secondary Electron GUI instances.
- **Next.js Standalone Mode:** Configured `output: 'standalone'` in `next.config.mjs` and added `scripts/prepare-standalone.mjs` to synchronize static assets into `.next/standalone`.
- **Zero Blank Screen Guard:** Implemented `electron/splash.html` with dark theme (`#090d16`), animated ChatFlow logo, loading spinner, and retry recovery UI.
- **Packaging Configuration:** Updated `electron-builder.json` with `asarUnpack: ['.next/standalone/**/*']` ensuring node executable access.
- **Verification:** Full production build and syntax checks passing.

---

## 2. Empirical Verification Results

| Suite | Status | Metrics |
|---|---|---|
| PostgreSQL RLS & Schema (`npm run test:db`) | **PASS** | 232 / 232 assertions |
| Unit & Integration (`npx vitest run`) | **PASS** | 101 / 101 tests across 7 test files |
| Gateway Security & E2E (`node gateway/test/gateway-e2e.test.mjs`) | **PASS** | 11 / 11 tests |
| TypeScript Compiler (`npm run typecheck`) | **PASS** | 0 errors |
| Next.js Standalone Build (`npm run build`) | **PASS** | Production build & static assets synced |
| Live VPS Gateway (`wss://168-138-160-93.sslip.io`) | **PASS** | Bidirectional messaging & room sync verified |

---

## 3. Pending Actions (Bước 5)
- Under House Rule #3, awaiting user authorization prior to deleting legacy SQLite files (`src/server/*`, `migrations/*`, `scripts/database.ts`).
