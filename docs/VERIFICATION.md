# Remediation verification — 2026-10-15

Status: local implementation and automated verification completed for T01–T19. Cloud migration/deployment, staging browser acceptance and authenticated packaged-UI account deletion have not been executed. This section supersedes the historical Phase 1 claims below for the current worktree.

## Fresh local results

| Command | Result | What it proves |
| --- | --- | --- |
| npm run typecheck | PASS, exit 0 | Current application and gateway shared protocol types |
| npm run lint | PASS, exit 0 | Repository lint alias runs TypeScript; this is not an ESLint audit |
| npm test | PASS, 176 tests / 11 files | UI/services, ID reconciliation, auth/desktop routes, socket lifecycle/upload, configuration policy |
| npm run test:db | PASS, 349 assertions | All eleven migrations in PGlite, RLS/grants/RPC, independent historical-schema upgrade |
| npm --prefix gateway test | PASS, 29 tests | Real local TCP/WebSocket/HTTP, authorization failures, session expiry, files/quotas/private download |
| Same compiled gateway suite on Ubuntu WSL / Node 22.13.0 | PASS, 29 tests, no skips | Native Linux filesystem, symlinks, exclusive writes, quotas, restart and full socket/HTTP cases |
| npm run test:local | PASS, one two-session integration scenario | Two real frontend GatewayClient adapters over local TCP: committed send/edit/recall, upload/download bytes, revocation, refresh, disconnect |
| npm run build | PASS, exit 0 | Next.js 16.3.6 optimized build, type compilation and standalone preparation |
| npx electron-builder --win --dir --publish never | PASS, exit 0 | Windows unpacked package, including ChatFlow.exe and standalone resources |
| npm run test:secrets | PASS, 4,228 artifacts | Browser, standalone, Windows distribution and ASAR scanned after packaging |
| npm run test:package | PASS, exit 0 | Packaged Electron executable in Node mode serves health/login, keeps callback local, rejects foreign listener/Origin and unauthenticated mutations |
| node --check on modified cloud/auth/attachment/package scripts | PASS | Syntax only; live scripts were not executed |
| git diff --check | PASS | No whitespace errors in reviewed changes |

The production build used the existing configured public origin; no test origin or secret was persisted. Packaging used --publish never. No source commit, push, cloud DDL, real-account test or release publication was performed.

The Linux runtime archive matched the SHA256 in the official nodejs.org v22.13.0 manifest. Tests ran in an isolated native Linux /tmp directory. Initial WSL harness invocations discovered zero tests because the final PowerShell carriage return contaminated the glob; those runs were rejected as evidence. The final invocation verified the TAP count explicitly: 29 tests, 29 passes, zero failures/skips. CI now includes an Ubuntu gateway job required before the Windows build; the remote CI workflow itself was not triggered.

## Finding and functional requirement evidence

| Review item | Implemented control | Relevant regression evidence |
| --- | --- | --- |
| Async dispatch rejection | Validated packets, serialized bounded queue, caught rejection | gateway packet validation and peer-continuity tests |
| Missing room authorizer | Mandatory production provider, user JWT/RLS on join/operation/delivery | authorizer and gateway e2e tests |
| Upload path trust | Server UUID, exclusive files, directory/containment/symlink checks | file-transfers filesystem/collision tests |
| Unbounded uploads | File/image/user/global/concurrency/idle/storage budgets, paced chunks | file-transfers quota/digest/restart tests |
| NULL SQL authorship | Row lock, membership and IS DISTINCT FROM | PGlite orphan/wrong-author/former-member regressions |
| Original content after recall | Private audit, atomic public redaction and live-parent child/Storage policy | Raw reads/grants/rollback, text/file/GIF/sticker upgrade fixtures |
| Client message authority | DB author/room/client-request/state verification; ID-only notification; RLS hydration | message-authority, gateway-client, ChatFlow and two-session adapter tests |
| Upload ownership | User/socket/room manifest and current membership | wrong-owner/wrong-session and room-negative transfer tests |
| Public gateway download | Scoped expiring HMAC capability plus active session/membership recheck | HTTP bytes, anonymous/raw/expired/tampered/revoked download tests |
| Session valid only at HELLO | Deadline, expiry, same-subject reauth and ACK-gated client | server lifecycle and frontend transport tests |
| Anonymous presence | Valid authenticated recipients only | gateway presence privacy suite |
| Blocked presence | Two-way DB projection/column grants and delivery-time gateway check | PGlite direct SELECT/RPC/embedding and presence/typing tests |
| Stale preview | Latest-row edit/recall trigger plus recompute of all persisted latest previews | PGlite new/old edits, recalled latest, timestamp/cursor and historical edited-preview upgrade |
| Desktop origin failure | Trusted loopback identity forwarding to configured hosted HTTPS; NextURL normalization guarded by exact original Host | Route unit tests and actual packaged-runtime smoke |
| Misleading account deletion text | Explicit retention disclosure; failure remains retryable | Settings view tests and account cleanup failure tests |
| Stranded departed drafts | Owner-only list/claim after leave, no byte-read grant, hosted exact-claim cleanup fallback | PGlite leave/quota/race tests; service/route tests; staged script extended |
| Whole .env copy risk | Public configuration allowlist, inherited-secret filtering, static/standalone/package/ASAR gate | Fake credential/config fixtures, build and packaged scan |

## Integration repairs found during verification

The initial 50ms real-time upload-expiry fixture could expire during parallel test load. It now uses an injected clock; idle cleanup is checked independently of machine speed. No production timeout was weakened.

A packaged runtime test reproduced a real 403 on legitimate loopback requests. Installed NextURL code normalizes 127.0.0.1 to localhost. Desktop guards now accept that representation only with the exact original 127.0.0.1:port Host and trusted Origin; foreign hosts/ports remain rejected. Confirmation/recovery redirects use the same verified listener and stay local. Raw HTTP tests verify Host handling; Node fetch does not send an arbitrary overridden Host here.

An independent upgrade fixture exposed an old edited latest message retaining its stale preview. The migration now recomputes previews for every referenced latest row, preserving IDs and timestamps. The added regression first failed on the old migration and passed after the correction.

Account cleanup now pages attachment metadata explicitly and deletes Storage bytes in batches. A 1,001-attachment regression first reproduced silent truncation at the default 1,000-row response cap, then passed with pagination. Cleanup errors still prevent identity deletion.

## Scope and outstanding release verification

- PGlite mocks managed Auth/Storage/Realtime infrastructure. Its 349 assertions do not establish cloud Storage HTTP or hosted Realtime behavior.
- The two-adapter scenario runs real sockets and frontend transport code, with an in-memory committed-row provider. Frontend reconciliation is separately tested with component/service fixtures. Two authenticated browser sessions against the newly migrated staging backend remain a release check.
- Packaged smoke runs ChatFlow.exe as Electron's Node runtime with a hidden child process. It verifies packaged server resources and real route behavior, not rendered BrowserWindow interaction, installer behavior, code-signing identity or successful deletion of a real user.
- Cloud/auth/attachment scripts were extended for raw recalled file denial, presence masking, invalid bearer isolation, desktop callbacks and cleanup after leave. They need an explicitly selected staging target, hosted endpoint and isolated disposable accounts. No live result is claimed.
- Operator must provide/verify the hosted account HTTPS origin and admin secret in its server secret store, migrate staging, configure gateway public-key authorization and coordinate protocol/schema/client rollout as documented in DEPLOYMENT.md.
- Existing cloud migration history and running gateway version were not inspected during implementation. Previous historical evidence below is not current deployment evidence.
- SMTP inbox delivery, gateway capacity/load, audit retention period, completed-file operational retention and packaged UI acceptance remain operator release concerns. No scheduled cleanup service was added.
- Vitest emits the existing future Vite config-loader warning. Electron-builder reports missing author/description, default icon and duplicate dependency references; packaging succeeded. No valid signing certificate was established by these checks.

## Current artifacts

Migration: supabase/migrations/20261014000000_remediation.sql. Implementation checklist: tasks/todo.md. Plan and integration adjustments: tasks/plan.md. Release order: docs/DEPLOYMENT.md. Wire/data contract: docs/API.md. Windows smoke artifact: release/win-unpacked/ChatFlow.exe (ignored build output; not published).

---

# Historical Phase 1 evidence (not rerun for this remediation)


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
