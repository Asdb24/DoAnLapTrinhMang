# Technical Changelog: Purge All Mock Data & Seed Data

**Date:** 2026-10-07  
**Author:** Antigravity Pairing Agent  
**Branch:** `feat/remove-all-mock-and-seed-data`  

---

## 1. Objective
Completely eliminate all mock data, seed data, and unverified mock-token authentication backdoors from the production source tree and Gateway server, ensuring 100% production-authentic data pipelines and cryptographic verification.

---

## 2. Technical Modifications

### 2.1 Elimination of Production Mock Data
- **Deleted:** `src/lib/mockData.ts` (403 lines of fake profiles, contacts, and channels) permanently removed from the application production bundle.
- **Relocated:** Unit test fixtures scoped strictly to `src/test/fixtures.ts` to support isolated Vitest in-memory component tests (`src/test/setup.ts`, `src/test/views.test.tsx`).
- **Verified:** Zero application code (`src/components/`, `src/services/`, `src/context/`) imports mock data. All workspace and message loading flows through live Supabase REST/RPC queries (`loadWorkspace`, `messagePage`, `send_message`).

### 2.2 Removal of Gateway Mock-Token Backdoors
- **`gateway/src/server.ts`**:
  - Removed `allowDevMockTokens` configuration option from `GatewayOptions` and constructor defaults.
  - Removed `mock-token:*`, `mock-token-*`, `dev-token`, and unverified token fallback from `verifyAuthToken()`.
  - Removed `parseJwtUnverified()` function. Every inbound connection MUST present a cryptographically verified HS256 JWT signature via `supabaseJwtSecret` or a verified token via Supabase Auth API endpoint.
- **`gateway/src/index.ts`**:
  - Removed `ALLOW_DEV_MOCK_TOKENS` environment variable and configuration passthrough.
- **`gateway/test/gateway-e2e.test.mjs`**:
  - Removed `allowDevMockTokens: true`.
  - Replaced test #9 mock token (`mock-token:user_huge`) with a signed cryptographic HS256 JWT using `createTestJwt()`.
- **`scripts/test-live-gateway-chat.mjs`**:
  - Updated live gateway testing script to compute and transmit authentic HMAC-SHA256 JWT tokens.

---

## 3. Empirical Verification Evidence
1. **TypeScript Build & Typecheck:**
   - Gateway compile (`npm --prefix gateway run build`): Exit code 0, 0 errors.
   - Frontend typecheck (`npm run typecheck`): Exit code 0, 0 errors.
2. **Gateway RFC 6455 End-to-End Suite:**
   - `node gateway/test/gateway-e2e.test.mjs`: 11/11 tests passed (Exit code 0).
3. **Database RLS & Schema Engine:**
   - `npm run test:db`: 232/232 assertions passed in PGlite.
4. **Vitest Unit Test Suite:**
   - `npx vitest run`: 101/101 tests passed across 7 test files.
5. **Secret Scanner:**
   - `npm run test:secrets`: 26 browser artifacts scanned, 0 secrets detected.
