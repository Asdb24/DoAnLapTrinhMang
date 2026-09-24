# Production deployment

This runbook targets the Phase 1 **Next.js 16 / React 19** application with Supabase Auth, PostgreSQL/RLS/RPC, Realtime, and private Storage. It is not a static-site or SQLite deployment. Keep the existing shadcn/ui and Tailwind assets in the application build.

**Implemented baseline:** Next.js 16.3.6 / React 19.3.0, Proxy-based session refresh, asynchronous route parameters, centralized `NEXT_PUBLIC_APP_URL` validation, recovery and media/personalization are implemented. The verification run passed production build, typecheck/lint, 100 UI/service tests and a scan of 26 browser artifacts, with two-user browser checks completed. See the [VERIFICATION.md](VERIFICATION.md) for the detailed evidence. Public hosting/domain configuration and actual SMTP inbox delivery remain deployment work; local and Cloud tests do not establish those. Current contracts are in [API.md](API.md).

## 1. Choose the production origin

No real public ChatAi domain has been supplied. Choose a domain you control and configure its DNS and HTTPS certificate with the hosting provider. Do not permanently use an example domain.

Throughout these docs, `<PUBLIC_APP_HOST>`, `<PROJECT_REF>`, and similar bracketed values are placeholders to replace. `NEXT_PUBLIC_APP_URL` must be the one canonical production origin, for example the shape `https://<PUBLIC_APP_HOST>`, without credentials, a path prefix, query, or fragment. It must never be a loopback address or development origin in production.

Use that same configured origin for signup callback generation, account recovery, redirects, metadata/canonical links, shared application links, and Supabase Auth settings. Application-relative attachment/avatar URLs resolve against it. Redirect secondary domains to the canonical host at the trusted edge; do not infer security-sensitive redirects from arbitrary request/forwarded host headers.

Centralized validation rejects missing/invalid production origins, including non-HTTPS and local/IP hosts. Production callbacks and account-origin checks use this configured value; request origins are development fallbacks only. Keep development and preview settings isolated from production; do not copy a local development default from `supabase/config.toml` into Cloud Auth.

## 2. Runtime and reproducible build

Use a supported Node release satisfying the repository's `engines.node` requirement of **22.13.0 or newer**, with the same Node major in CI and production. The repository requirement is stricter than Next.js 16's 20.9 minimum. Install the checked-in lockfile with `npm ci`; do not resolve fresh `latest` versions during deployment. Next.js 16 uses Turbopack by default, removes synchronous request API compatibility, and renames the middleware convention to Proxy. Review the actual migration rather than only changing package versions. [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16).

```sh
node --version
npm ci
npm ls next react react-dom typescript
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm run test:secrets
```

Read the final `package.json` scripts: at review time `lint` runs TypeScript, not an independent ESLint rule set. Do not report it as an ESLint audit. The secret scan inspects build output and must run after the build. Tests/build results belong in `VERIFICATION.md`; this runbook does not assert a passing release.

Production uses `npm run build` followed by `npm run start`. Do not use the development server or `output: export`: SSR session refresh, auth callbacks, downloads, and account deletion need a server runtime. A managed Next.js host or a Node process/container behind an HTTPS reverse proxy can provide it. For self-hosting, use a process supervisor, graceful restarts, a non-root service account, and a reverse proxy with appropriate request limits. Preserve the correct public scheme/host and cookies. [Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting).

## 3. Environment variables

Enter secrets through your host's secret manager. Do not commit `.env.local`, export secrets into build logs, or paste real keys into this runbook.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public; configure before build and at runtime | Required canonical application HTTPS origin; validated at production build and use |
| `NEXT_PUBLIC_SUPABASE_URL` | Public; build/runtime | Selected Supabase project's API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public; build/runtime | Preferred browser/server user-client project key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public; legacy alternative | Used only when the publishable-key variable is absent |
| `NEXT_PUBLIC_GIPHY_API_KEY` | Public; build/runtime | GIPHY public browser API key for search/trending and ID lookup; configured in the current workspace |
| `SUPABASE_SECRET_KEY` | Server only, runtime | Optional privileged key for authenticated self-account deletion |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only, legacy alternative | Used only when the secret-key variable is absent |
| `SUPABASE_ACCESS_TOKEN` | Deployment tooling only | Supabase CLI automation; interactive CLI login is an alternative |
| `SUPABASE_DB_PASSWORD` | Deployment tooling only, if required | Database connection credential for the CLI; not an application runtime requirement |
| `TEST_APP_ORIGIN` | Test tooling only | Explicit canonical HTTPS origin for hosted callback/account integration tests |

Public configuration template, deliberately unusable until placeholders are replaced:

```dotenv
NEXT_PUBLIC_APP_URL=https://<PUBLIC_APP_HOST>
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PROJECT_PUBLISHABLE_KEY>
```

Configure `SUPABASE_SECRET_KEY` separately in the server secret store if enabling account deletion. Never put it, a service-role key, a database password, SMTP password, or CLI token in a `NEXT_PUBLIC_` variable. SMTP credentials belong in Supabase Auth's SMTP configuration, not the Next.js browser environment. Set `NEXT_PUBLIC_GIPHY_API_KEY` before building to enable the implemented provider adapter. It must be a public client credential, never a privileged secret. Live GIF search/trending/send/recent/frequent were verified in this workspace; other environments need their own configuration.

Next.js public environment values are embedded into client bundles at build time. Rebuild when changing project/domain/public-key configuration; restarting an old artifact is insufficient. Keep preview and production projects/keys separate, and confirm server and browser clients point to the same intended project. [Next.js environment variable behavior](https://nextjs.org/docs/app/guides/environment-variables).

## 4. Supabase project and migrations

Select the intended project and region. With the connected Supabase MCP, inspect migration history, actual RPC signatures, bucket policy/settings, and the publication before applying changes. Compare with repository SQL; never assume a local file proves a remote migration ran. Read-only MCP inspection confirmed all nine local migrations applied remotely: `20260919000000` through `20260919000006`, `20260922200503_media_personalization`, and `20260923114208_attachment_discard_claim`. The last migration includes discard serialization and service-role CHECK-helper permissions. Inspect any different deployment target before release.

Use repository migrations as the release artifact. Review/apply new migrations in staging first; take an appropriate backup and establish restore ownership before production DDL. Existing Auth/Storage/Realtime schemas are Supabase-managed. If a newly created project has not initialized Realtime infrastructure, initialize it using supported provider setup and verify the objects exist before applying migrations that reference them. Do not create fake production provider schemas; those exist only in the PGlite test bootstrap.

Example CLI sequence (replace the project placeholder and use secure credential input):

```sh
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npm run db:migrate
npm run db:types
```

These commands affect the linked project; verify the target before the push. Do not add `--include-seed`, reset production, or rewrite applied migration history to make a mismatch disappear. Reconcile any divergence deliberately. Generated types belong in `src/types/database.generated.ts`; keep hand-maintained application aliases separate. Hosted Auth/SMTP URL settings are not applied by a plain SQL migration push. [Supabase deployment and migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).

Check actual database permissions after deployment: RLS enabled on exposed tables; authenticated membership-based reads; only explicit RPC execute grants; no direct browser membership/message/rate-bucket writes; no email field in the public profile directory. Service-role access is intentionally privileged and must remain isolated to the account/admin tooling path.

## 5. Auth and email configuration

In Supabase Auth URL Configuration, set **Site URL** to the exact `NEXT_PUBLIC_APP_URL` value. Allow the exact `${NEXT_PUBLIC_APP_URL}/auth/callback` URL. Also allow the exact `${NEXT_PUBLIC_APP_URL}/auth/callback?type=recovery` recovery destination; the callback redirects internally to the implemented `/reset-password` page. Prefer exact production paths, with separately scoped preview allowlists only when needed. Supabase uses Site URL as its default redirect; mismatched settings can send users to the wrong environment. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

Enable email/password authentication and email confirmation. Align server-side password policy with the UI's ten-character minimum. Configure production custom SMTP and verified sending DNS using [SMTP.md](SMTP.md). Confirm the actual Cloud settings rather than assuming the local TOML was deployed.

Review the migrated `src/proxy.ts` session-refresh logic (the pre-upgrade source used `src/middleware.ts`). Preserve request and response cookie updates and avoid caching authenticated responses or `Set-Cookie` across users. The server must validate users before private downloads/deletion; middleware/Proxy is not a substitute for RLS. [Supabase SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).

**Recovery is implemented:** the public reset request uses a neutral response, the callback exchanges PKCE codes or verifies recovery token hashes, and the authenticated `/reset-password` page updates matching passwords through Supabase. Generated-link tests verify session/password behavior without sending mail. Actual production inbox delivery still requires custom SMTP configuration and testing.

## 6. Realtime and private Storage

Confirm `supabase_realtime` publishes `messages`, `message_reactions`, `attachments`, `conversations`, and `conversation_members`. Verify private topic policies for the caller's `user:<id>` inbox and member-only `conversation:<id>` topics. Verify database triggers send `conversation_changed` and `reaction_changed` notifications. The application's active subscription should reconcile after channel join and replication-ready system events; WebSocket connection success alone does not prove message replication works.

Permit outbound browser HTTPS and WSS access to the selected Supabase project. Do not replace Realtime with polling or subscribe every user to all message bodies. Ensure navigation/sign-out remove subscriptions, reconnect catches up by cursor, and clear-history invalidates in-flight pages.

| Bucket | Visibility | Limit | Required behavior |
| --- | --- | --- | --- |
| `chat-attachments` | Private | 25 MiB bucket; image reservation limit 10 MiB | Reservation bound to conversation/uploader; no upsert; verify object metadata at send |
| `profile-avatars` | Private | 2 MiB | PNG/JPEG/WebP/GIF; owner-path insert/delete; authenticated directory reads |

Uploads go directly to Supabase Storage. Downloads pass through authenticated Next.js routes, so size/time limits and egress budgets on the Next.js host must accommodate files up to 25 MiB; test the chosen host's response/streaming behavior rather than assuming local success proves deployment compatibility. Keep private responses out of shared caches. Never make buckets public to work around a failed download.

Retain migrations for null/empty/partial Storage authorization metadata: preflight `contentLength` is not finalized object `size`. The database send RPC must still reject missing/mismatched finalized metadata. Authenticated workspace startup attempts cleanup of up to 20 owner-only unbound uploads older than 24 hours. Cleanup claims the row before deleting bytes, then finalizes the reservation; sends reject claimed rows. Plan operational maintenance for inactive accounts, cleanup failures and obsolete avatars; there is no scheduled server cleanup job.

## 7. Post-deployment acceptance

Run these checks at the configured public HTTPS origin with dedicated test accounts and controlled mailboxes:

1. Confirm DNS, TLS, canonical-host redirects, and `GET /api/health`. Check the health response but also exercise the real data plane.
2. Sign up, receive a real confirmation email, follow it, sign in, reload to restore the session, and sign out. Inspect generated links for the intended public origin and verify no development hostname leaks.
3. Request recovery, follow the email, and set a new password at `/reset-password`. Reject reused/expired tokens; verify success with a fresh sign-in.
4. With users A and B, create a DM, send text/files both directions without refreshing, react, mark read, and verify reconnect and older-page cursors. Check idempotent send retry and no duplicated messages.
5. With an outsider, verify private channel, message, attachment, and broadcast access is denied. A public channel catalog entry must not expose its message history.
6. Test images and non-image files, maximum-size boundaries, cancellation/retry, failed uploads, and actual downloaded bytes. Remove channel membership and clear history; verify access changes.
7. Test profile settings and private avatar retrieval. Exercise self-account deletion with a disposable account if the admin key is enabled; verify wrong-origin requests fail.
8. Check browser/server logs for errors without recording tokens or email-link query strings. Check Cloud Auth, Storage, and Realtime metrics and mail-provider delivery logs.

`npm run test:cloud` mutates the selected project using isolated test accounts and attempts cleanup; it requires a server-only admin key. `npm run test:auth` also exercises a running application and account deletion. Set `TEST_APP_ORIGIN` explicitly to the intended HTTPS deployment; do not allow the script's development fallback to select the target. The reviewed scripts load `.env.local`, so provision a private ignored test environment on the trusted runner and remove it afterward. Never run retained-account mode against production casually or publish generated credentials/test artifacts.

PGlite regression success is evidence about SQL/RLS, not Cloud Storage, Realtime delivery, SMTP, or hosting. Generated-link callback tests bypass actual email delivery; separately verify the SMTP inbox path. Use the existing cleanup tooling for interrupted cloud tests after verifying its target and recorded account IDs.

## 8. Rollback and operations

Keep the previous tested application artifact and its compatible environment configuration. Use additive migrations when possible so old/new application versions can overlap during rollout. A UI rollback does not undo SQL migrations, Auth configuration, bucket policies, SMTP settings, or data writes.

If a migration is faulty, prefer a reviewed forward-fix migration. Do not reset the database or remove migration-history rows. For destructive failures, restore using the project's documented backup/PITR capabilities and the established incident procedure; account for writes made after the restore point. Database backup alone does not imply Storage object bytes or external SMTP settings are backed up—verify each separately. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).

Monitor auth failures, RPC errors/rate limits, upload reservation growth, Storage quota/egress, Realtime disconnects, mail bounces, and callback errors. Rotate privileged credentials through the provider and host secret manager after exposure; rebuild client artifacts only for changed public configuration. Re-run targeted acceptance checks after policy, SMTP, domain, or deployment changes.

