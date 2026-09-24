# Phase 1 verification — 2026-09-24

Status: implementation and automated checks verified; public deployment remains subject to the external configuration below.

## Executed checks

| Check | Current result | Scope |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript, including generated live database types |
| `npm run lint` | PASS | Existing repository script runs TypeScript, not ESLint |
| `npm test` | PASS: 100 tests / 7 files | UI/service regression coverage |
| `npm run test:db` | PASS: 223 assertions | All nine migrations in PGlite; RLS, RPC, claims, validators and usage |
| `npm run test:cloud` | PASS: 43 assertions | Real Supabase Auth, PostgreSQL, Storage and private Realtime, three disposable users |
| `node scripts/test-attachment-flow.mjs` | PASS: 8 scenarios | Five File multipart formats plus three real concurrent send/discard races |
| `npm run test:auth` | PASS: 8 reported checks | Signup/recovery callbacks, cookies, password change, origin protection and self-deletion |
| `npm run build` with temporary test HTTPS origin | PASS | Next.js 16.3.6 optimized build and route generation |
| `npm run test:secrets` | PASS: 26 browser artifacts | Configured administrative values absent from browser bundles |

The production build used a command-scoped `NEXT_PUBLIC_APP_URL=https://chat.example.test` solely to exercise the required configuration. That is a test origin, not a deployed site or persisted production setting. An unset/unsafe origin fails the production configuration validator; unit tests cover local hosts, credentials, paths, schemes and malformed origins. A real domain must be supplied by deployment.

Vitest currently emits a future Vite config-loader compatibility warning for the TypeScript config's CommonJS/ESM format. It does not fail tests; it has not been suppressed.

## Remote source of truth

Supabase MCP confirms project `boonwujyiwqbrraqdbdy` has nine migrations, including `20260922200503_media_personalization` and `20260923114208_attachment_discard_claim`. Generated database types were refreshed after applying the latter. MCP verified the claim RPC exists and the trusted service role can execute media validators used by CHECK constraints. Browser roles did not receive administrative grants.

The Security Advisor reports 16 intentionally callable authenticated SECURITY DEFINER RPCs and an internal rate-bucket table with RLS and no direct policies. These are explicit transactional authorization boundaries: ownership/membership checks, fixed search paths and revoked anonymous execution remain required. The live isolation tests do not replace review of new privileged functions. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Leaked-password protection is disabled in the connected project and remains a deployment limitation. [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Regression evidence

- Browser File MIME normalization handles missing MIME, ZIP aliases and Office formats; declared unsafe MIME is not silently overridden. Final database commit validates actual stored bytes and MIME.
- Preupload queue limits concurrency to two; failed uploads retry explicitly; late removed uploads and failed unmounted sends are cleaned. A claimed discard and message commit lock the same row. Live concurrent tests verify the winner and private Storage enforcement.
- Optimistic sends render before RPC completion, reconcile both event orders by request UUID/server ID, and retain draft identity on retry. Confirmed sends do not await workspace/detail refreshes.
- Pagination/read cursors exclude pending records. Generation checks reject stale history and reaction hydration after clear/logout.
- Emoji categories/search/skin tones/cursor insertion and repeated insertion are covered; unsupported usage hints never prevent ordinary Unicode text sends.
- GIF adapter tests cover provider search, filtering, pagination and errors. Cloud tests verify stable GIF metadata delivery, not live GIPHY search.
- Versioned original stickers, media previews and private recent/frequent rankings are covered. Cloud users cannot read one another's usage or forge counts; idempotent retries do not increase usage.
- Recovery tests generate real tokens without sending mail. They prove callback/session/password behavior, not SMTP delivery to a mailbox.

## Outstanding verification and external configuration

- The user created and supplied a GIPHY browser API key, stored only in ignored `.env.local`. Live trending, search for `happy cat`, preview, send, Recent and Frequently used were verified in the browser. The provider describes beta keys as 100 API calls/hour and requires an upgrade application for production.
- Two independent browser sessions (localhost and peer.localhost, development only) verified GIF A→B, sticker B→A and emoji A→B without recipient reload. Sender and recipient each displayed one copy of the selected media. After reload, history still displayed the GIF and sticker. A real file chooser upload reached Ready before an empty-text send and appeared at B as an authenticated attachment link.
- Browser checks confirmed A's recent/frequent GIF and emoji, B's recent/frequent sticker, and an empty GIF collection at B despite A's GIF use. No warnings/errors were recorded in the final two tabs, including no hydration warning. A transient JWT-issued-in-future error was visible on an earlier session restoration and resolved on retry; no validation was disabled.
- CDP viewport emulation exposed a 38px text field at 360px width. The composer now gives text its own row below the small-screen breakpoint: measured 258px at 360px and 218px at 320px, with no horizontal document overflow. Browser checks also verified cursor insertion after typing and restored textarea focus after closing the picker. Temporary viewport overrides were reset.
- No real public domain, public deployment, custom SMTP sender or actual inbox-delivery result has been supplied/verified. Follow DEPLOYMENT.md and SMTP.md before public release.
- `npm run test:cloud:cleanup` completed after browser verification, removing only the retained fixture identities, conversation and uploaded objects (including the extra browser upload). The temporary credential file was removed.

PGlite mocks Supabase-managed infrastructure and cannot establish Storage HTTP or WebSocket correctness. The separate cloud checks provide that evidence. None of these results establishes load capacity or production SMTP/provider quotas.

## Requirement audit

| Objective | Evidence |
| --- | --- |
| Attachment root cause and full flow | MIME validation/service tests, five live File multipart formats, browser Ready/send/recipient link, authorized cloud download |
| Responsive send/idempotency | Optimistic state before RPC; tests for both RPC/Realtime orders and preserved request identity; live dedup assertion |
| Next 16 complete migration | Exact Next 16.3.6/React 19.3.0 lockfile; official proxy codemod reviewed; async cookies/params; production Turbopack build; clean browser logs |
| Supabase architecture | Nine live migrations, generated types, private channels, cloud tests; MCP confirms all nine public tables have RLS and both buckets remain private |
| Emoji/GIF/sticker | Lazy shadcn picker, original versioned CC0 sticker assets, adapter tests and live two-user browser checks |
| Personalized suggestions | Deterministic frequency/recency service, private media_usage RLS, first-commit instrumentation; client forgery and cross-user reads denied |
| Mandatory shadcn UI | Existing Button/Popover/Tabs/Input/Select/ScrollArea primitives reused; no competing component framework added |
| Canonical public HTTPS | One NEXT_PUBLIC_APP_URL; production validation fails missing/local values; signup/reset/callback/metadata/account-origin use it; real deployment domain not supplied |
| Current API and legacy separation | docs/API.md and docs/LEGACY_API.md describe separate runtimes |
| Deployment and SMTP | docs/DEPLOYMENT.md and docs/SMTP.md cover domain, Auth, migrations, runtime, rollback, sender, TLS, DNS, templates and mail limits |
| Production audit | No runtime SQLite imports or polling loops found in current app/services/context/lib; private Storage and secret scan retained; clear/logout/unmount races fixed |
| Regression/verification | Command table above, focused cloud scripts and browser evidence; no suppressed type/build/hydration failures |

## Root causes and delivered behavior

Attachment failures came from inconsistent browser MIME values/allowlists and multipart uploads using File.type rather than only the requested contentType. Supabase Storage preflight metadata can be incomplete, so policies permit that preflight while send_message verifies finalized size/MIME before binding. The additional discard claim closes a real race between byte deletion and message commit.

The previous send path waited for upload and follow-up hydration/workspace work. Preupload with concurrency two and visible statuses moves bytes before Send; optimistic records appear immediately and reconcile against authoritative commit. Failed uploads/messages remain retryable with stable request identity. Safe cleanup covers removed, unmounted and abandoned drafts.

The two new migrations add compact private media usage/message metadata and atomic attachment-discard claims. GIF binaries remain on GIPHY; messages retain approved metadata. Sticker messages retain versioned IDs, and Unicode emoji stay ordinary text. Frequency/recency calculations use lightweight usage rows rather than private message scans.

Final installed versions: Next 16.3.6; React/React DOM 19.3.0; React/React DOM types 19.3.0; TypeScript 5.9.3. No Desktop work was started.
