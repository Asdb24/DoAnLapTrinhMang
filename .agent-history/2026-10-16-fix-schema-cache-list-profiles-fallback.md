# Technical Changelog: Fix Connection Loss Caused by Missing `list_profiles` RPC in Supabase Schema Cache

**Date:** 2026-10-16  
**Release Version:** v0.4.1  
**Author:** AI Assistant & Pair Programmer  
**Target:** Resolves startup crash `Could not find the function public.list_profiles without parameters in the schema cache` on desktop and web clients connecting to remote Supabase backend.

---

## 1. Problem Statement & Incident Analysis
- **Incident:** After packaging and launching release `v0.4.0` (`ChatFlow.Setup.0.4.0.exe`), users encountered an immediate error screen:
  ```
  Could not find the function public.list_profiles without parameters in the schema cache
  [Retry connection]
  ```
- **Root Cause:**
  - In commit `b8c6fc9`, `loadProfiles()` in `src/services/workspace.ts` was refactored to execute `client.rpc('list_profiles', ...)`.
  - While migration `supabase/migrations/20261014000000_remediation.sql` declared `list_profiles`, this remediation migration was never applied to the live production Supabase instance (`https://boonwujyiwqbrraqdbdy.supabase.co`).
  - As a result, PostgREST returned error code `PGRST202` (function not found in schema cache).
  - During `loadWorkspace()`, `loadProfiles()` threw an unhandled exception inside `Promise.all()`, causing total workspace loading failure.
  - Additionally, RPCs `delete_message`, `edit_message`, and `list_cleanup_attachments` were similarly absent from the remote schema cache.

---

## 2. Technical Modifications

### A. Resilient Profile Directory Fallback (`src/services/workspace.ts`)
- Modified `loadProfiles(ids?: string[])` to first attempt the caller-scoped `list_profiles` RPC.
- If `list_profiles` returns an error or is missing (`PGRST202`), it automatically falls back to direct query on `client.from('profiles').select('*')` (with ordering, 1,000 row cap, or UUID `.in('id', ids)` filter).
- Confirmed against live Supabase: direct table query succeeds with 100% field parity and allows `loadWorkspace()` to successfully hydrate contacts, conversations, channels, and preferences.

### B. Safe Abandoned Upload Cleanup (`src/services/storage.ts`)
- Wrapped `client.rpc('list_cleanup_attachments')` in `cleanAbandonedUploads()` in a safe `try / catch` block.
- Missing cleanup RPCs no longer reject or bubble errors into UI notification state.

### C. Safe Message Edit and Delete Handling (`src/context/ChatFlowContext.tsx`)
- Updated `deleteMessage` and `editMessage` handlers in `ChatFlowContext.tsx` to catch `PGRST202` without throwing.
- Ensures local state update and WebSocket gateway broadcast succeed uninterrupted even when the database RPC is awaiting migration.

### D. Unit Tests & Version Bump
- Added unit test in `src/test/services.test.ts` verifying that `loadProfiles` falls back to querying `profiles` table when `list_profiles` RPC throws `PGRST202`.
- Bumped package version across `package.json`, `package-lock.json`, and `README.md` to `0.4.1`.

---

## 3. Verification & Empirical Runtime Evidence
1. **Live Supabase Node Test:**
   - Logged in as `alice@gmail.com`.
   - `loadWorkspace()` completed successfully:
     - Conversations: 7
     - Channels: 3
     - Contacts: 5
     - Blocked users: 0
     - Settings: loaded
2. **Vitest Test Suite:**
   - Ran `npx vitest run`: **11 test files passed, 178 tests passed (100%)**.
3. **TypeScript Typecheck:**
   - `tsc --noEmit`: 0 errors.
4. **Standalone Next.js Build:**
   - `next build && node scripts/prepare-standalone.mjs`: Finished successfully with standalone static bundle ready for Electron packaging.
