# ChatFlow — Supabase messaging

The existing Next.js UI now uses Supabase Cloud Auth, PostgreSQL, Realtime and private Storage. There is no SQLite backend or five-second polling in the production request path.

## Run this configured workspace

```powershell
npm install
npm run dev -- --port 3100
```

Open http://localhost:3100. `.env.local` already contains this workspace's project URL/public key and a server-only key for account deletion. It is ignored by Git. Never copy the server key into a `NEXT_PUBLIC_` variable. The linked project is **ChatFlow**, `boonwujyiwqbrraqdbdy`, Singapore, in the Free organization created during setup.

For production, set `NEXT_PUBLIC_APP_URL` to your real public HTTPS origin before building. Missing or local origins fail the production build. No public domain has been configured in this workspace. See [deployment instructions](docs/DEPLOYMENT.md).

```powershell
npm run build
npm start
```

Each computer can run the UI against the same Supabase project; messages and files travel through the cloud. This task does not publish the Next.js UI to a public host. To share one public URL, deploy Next.js to a Node-compatible host, set the environment variables before building, and add that site's exact `/auth/callback` URL and Site URL in Supabase Auth. Keep HTTPS enabled in production.

## Phase 1 features

Next.js 16.3.6, React/React DOM 19.3.0 and TypeScript 5.9.3 retain the existing shadcn/ui design system. Composer attachments upload before Send with concurrency two, visible status, retry and removal. Optimistic messages reconcile by server ID and client request UUID. A database discard claim prevents cleanup racing a committed send.

The lazy-loaded composer offers searchable emoji categories, skin tones and cursor insertion; GIPHY search/trending with previews; and the original CC0 Little Orbs v1 sticker pack. Recent/frequent suggestions use private per-user usage metadata and deterministic frequency/recency ranking, not message-history scans. Usage is recorded only on the first committed send.

Set the public browser credential `NEXT_PUBLIC_GIPHY_API_KEY` to enable live GIF search. It is configured in this workspace; live browser search, trending, send, Recent and Frequently Used have been verified. Other deployments must configure their public key before building. Never put a privileged credential in that variable. GIF messages persist provider ID, approved media URLs and dimensions; stickers persist versioned IDs.

## Accounts and email

Create an account from the sign-in screen and confirm its email. Login, logout and session restoration use Supabase Auth and its official SSR cookie integration. Profiles/preferences are created by an Auth database trigger. The public profile directory does not expose account emails.

Forgot-password requests, recovery callbacks and password updates are implemented. Generated-link tests verify the flow without sending email; actual SMTP inbox delivery remains a deployment check.

Email confirmations remain enabled. Supabase's default mail service has recipient/rate restrictions; configure your own SMTP service before inviting general external users. No SMTP credentials or production hosting account were provided. Administrators can create confirmed development accounts in Supabase Authentication; the cloud verification script also creates isolated test accounts without sending email.

## Reproduce setup in another Supabase project

1. Copy `.env.example` to `.env.local`, then set that project's URL and publishable (or legacy anon) key.
2. Run `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`.
3. Ensure Realtime has initialized on a newly provisioned project before migration (opening its Realtime inspector or connecting a channel initializes the managed Realtime schema).
4. Run `npm run db:migrate`. The nine ordered SQL migrations include schema, RPC, RLS, buckets, Storage policies, and publication setup.
5. Configure Auth redirect URLs and a minimum password length of 10. Review `npx supabase config diff` before `npx supabase config push`; do not overwrite unrelated project settings blindly.
6. In Realtime Settings turn **Allow public access to channels** off. The app joins only private channels.
7. Run `npm run db:types` to regenerate the database contract, then build and test.

No Docker, local PostgreSQL server, or psql installation is required for this Cloud workflow. The local Supabase CLI is included as a development dependency.

## Architecture

- `src/lib/supabase/`: singleton browser client, cookie-aware server client, environment validation.
- `src/proxy.ts`: validated session refresh and no-store response policy.
- `src/services/`: workspace metadata, cursor-paginated messages, private uploads and scoped Realtime subscriptions.
- `src/context/ChatFlowContext.tsx`: authenticated UI state, RPC actions, request generation guards, subscription cleanup and reconciliation.
- `src/app/auth/callback/route.ts`: PKCE/code, email confirmation and recovery-token callback; recovery redirects to the authenticated `/reset-password` page.
- `src/app/api/[...path]/route.ts`: authenticated attachment/avatar downloads, health and self-account deletion. File access always uses the caller's JWT, never the admin key.
- `src/types/database.generated.ts`: generated from the live public schema; `database.ts` adds application/RPC payload types.
- `supabase/migrations/`: complete reproducible database changes.

Tables: `profiles`, `user_settings`, `conversations`, `conversation_members`, `messages`, `attachments`, `media_usage`, `message_reactions`, `blocked_users`; internal rate buckets are in a non-exposed schema. Membership and message cursor indexes support authorized history queries. DM pairs have a unique canonical key. Message writes take authenticated identity and canonical timestamps from the database.

The sidebar loads metadata only. Opening a conversation fetches 40 recent messages. Scrolling upward or choosing **Load older messages** requests the next `(created_at, id)` page. Only the active conversation subscribes to message changes. A private user inbox invalidates conversation metadata; it contains no message bodies. Reconnect/visibility recovery re-reads loaded messages and cursor-fetches missed messages. Maps deduplicate repeated events; retry UUIDs prevent duplicate committed messages. Reconnect catch-up is capped at 200 missed messages; a larger gap resets to the latest 40-message window, with older messages available through pagination.

Read positions are monotonic cursors on membership rows. Public/private group channels, invitations, reactions, mute, profile/preferences, blocking and clear-my-history are persistent. Clearing history changes only the caller's visibility. Replies and saved-message types are represented in the schema for future UI work. Typing/automatic online presence and push/calls are not implemented; the current presence selector is manual. Private Broadcast/Presence authorization is prepared without database heartbeat writes.

## Security and limits

All sensitive tables use RLS. Browser writes use an explicit RPC allowlist with `auth.uid()` checks, membership authorization and fixed empty `search_path`. Direct message/member inserts are denied. SECURITY DEFINER RPCs are intentional transactional authorization boundaries; Supabase Advisor's generic warnings for authenticated execution are expected and must be assessed against these checks.

Storage buckets are private. Paths contain conversation/user/random UUIDs; filenames never authorize access. Upload reservations are validated before upload, and message commit verifies the actual Storage object MIME and byte size. Storage preflight can contain partial metadata, which the policies support; final message validation remains authoritative. Only the owner can discard uncommitted uploads. Authenticated download routes recheck database and Storage access on every request and return no-store/nosniff headers.

Limits: 10,000 UTF-8 bytes/message, five attachments/message, images up to 10 MiB, other allowed files up to 25 MiB, avatar up to 2 MiB, at most 20 staged uploads and 1 GiB declared attachment quota/user. Trusted limits cover sends (10 per 5 seconds), uploads, channels, direct conversations, reactions and invitations. Auth also uses Supabase's rate limits.

The server-only key is used only for account deletion and development verification. Account deletion removes the caller's uploaded objects before deleting their Auth user. Existing local `.env*`, SQLite `data/`, CLI temp files and test results are ignored.

## Verification commands

```powershell
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:cloud
npm run test:auth
npm run build
npm run test:secrets
```

`lint` is the project's TypeScript check. Vitest covers Auth gates, async action failures/retries, pagination, stale results, subscription cleanup, read state and existing UI interactions. PGlite tests execute real PostgreSQL migration/RLS logic with mocked Supabase-managed infrastructure. They do not substitute for Cloud verification.

`test:cloud` requires a server-only admin key in `.env.local`; it creates three uniquely named development accounts, signs in with public clients, tests bidirectional WebSocket delivery, persistence, deduplication, membership isolation, files, forbidden downloads, cursor ties and rate limits, then cleans up only its own fixtures. `node scripts/test-cloud.mjs --keep` retains fixtures for manual UI checks and writes their temporary credentials to ignored `.env.cloud-test.local`. Never deploy that file. The report is `test-results/cloud.json`.

For two-browser manual testing, use separate browser profiles (or localhost and peer.localhost for local checks; Next.js permits localhost subdomains for development assets), sign in as A/B, open their direct conversation, send both directions, refresh both pages, upload a file, and verify a third account cannot read it. Also test switching conversations, history pagination, network reconnect and a failed-send retry.

After a `--keep` run, use `npm run test:cloud:cleanup` to remove only the recorded test accounts/conversation/files. With Next.js running, `npm run test:auth` verifies a real signup confirmation token, SSR cookies and authenticated self-deletion without sending test email. See [the verification report](docs/VERIFICATION.md) for results and test boundaries.

Current contracts: [API](docs/API.md), [deployment](docs/DEPLOYMENT.md), [SMTP](docs/SMTP.md), [historical API](docs/LEGACY_API.md).

## Earlier local data

The earlier SQLite/localStorage implementation is retained only as legacy source and untouched local data (`src/server`, root `migrations`, `scripts/database.ts`, `scripts/api-smoke.mjs`). It is not imported by production routes. Old local identities/messages are not silently assigned to Supabase users. Any historical import requires an explicit verified identity mapping; existing files have not been deleted.

