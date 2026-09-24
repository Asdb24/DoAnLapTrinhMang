# ChatAi API: Supabase production architecture

The application uses Supabase Auth, PostgreSQL with row-level security (RLS), authorized PostgreSQL RPCs, scoped Realtime subscriptions, and private Storage. Next.js hosts the UI and a small HTTP surface for authenticated downloads, account deletion, and the auth callback. There is no production SQLite database or full-history polling API. Historical routes are separated into [LEGACY_API.md](LEGACY_API.md).

This contract was checked against repository code and the connected Supabase project's migrations through `20260923114208_attachment_discard_claim` on 2026-09-23. Both buckets are private and the expected five tables are published. Provider dashboard Auth/SMTP settings are configured separately; this check does not establish that they are production-ready.

Next.js 16.3.6 / React 19.3.0, canonical HTTPS-origin validation, recovery, GIF/sticker messages and private personalization are implemented. Nine migrations are applied on the connected project. Media uses the existing send RPC and direct provider API calls; there is no separate Next.js media HTTP endpoint.

## Authentication and trust boundaries

The browser uses `@supabase/ssr` / `supabase-js` with the project URL and publishable key. The authenticated user's access token accompanies SDK database, RPC, Storage, and Realtime calls. A publishable key alone grants no authenticated workspace access. Signup calls `auth.signUp` with `options.data.display_name`; sign-in calls `auth.signInWithPassword`; sign-out calls `auth.signOut`. The UI waits for an authenticated session and restores it through Auth events and `getUser`.

Next.js server clients read/write the Supabase SSR cookies and validate the user with `auth.getUser()`. These are not the former `chatflow_session` cookies; do not assume all Supabase browser-managed session cookies are HttpOnly. Never use an admin key for user-facing downloads or browser requests. Membership and object access remain enforced by the user's JWT and RLS.

Profiles form an authenticated directory. They include public display fields and optional usernames, not account email addresses. The caller's own email comes from Auth. Profile `role` is an editable display label; authorization comes from conversation membership roles, not user-editable profile metadata.

## Application HTTP endpoints

Paths are relative to the configured application origin. No storage path, admin credential, or Supabase token belongs in a public download URL.

| Method and path | Access and input | Current response |
| --- | --- | --- |
| `GET /api/health` | Public | `200 {"ok":true,"backend":"supabase"}` |
| `GET /api/attachments/:id` | Authenticated; attachment UUID | Authorized bytes or `404` |
| `GET /api/avatars/:userId?v=:version` | Authenticated; profile UUID | Current uploaded avatar bytes or `404`; `v` is a client cache-busting hint, not an object selector |
| `DELETE /api/account` | Authenticated same-origin request with `Origin` header | `200 {"ok":true}`; requires a server-only admin key |
| `GET /auth/callback?code=...` | Auth code received from Supabase | Exchanges code for SSR session; redirects to `/reset-password` when `type=recovery`, otherwise `/` |
| `GET /auth/callback?token_hash=...` | Email verification token hash | Verifies using `type: 'recovery'` when `type=recovery`, otherwise `'email'`; redirects to `/reset-password` or `/` respectively |

Health is a process-liveness response: it does not query the database, verify SMTP, or certify Realtime readiness. Protect readiness with separate authenticated smoke tests.

The current callback gives `code` precedence when both parameters exist. Invalid/missing tokens redirect to `/?auth_error=confirmation`. Recovery callbacks use `type=recovery` and redirect to `/reset-password`; other successful callbacks redirect to `/`. An arbitrary `next` destination is not accepted. Production redirects use the required canonical HTTPS origin described in [DEPLOYMENT.md](DEPLOYMENT.md).

The `/api` handler returns `{ "error": "..." }` for failures: `401` for invalid/missing auth, `404` for unavailable files or unsupported authenticated endpoints, `403` for an invalid deletion origin, and `503` for unavailable configuration/services. Unsupported unauthenticated `/api` calls can return `401` before route matching. RPC errors use the Supabase/PostgREST error contract instead; do not assume every SQL validation error maps to HTTP `400` or `429`.

### Downloads

For attachments, the route first reads the attachment row under RLS, then downloads from `chat-attachments` with the same authenticated client. For avatars, it resolves the profile's `avatar:<userId>/<version>` pointer and downloads from `profile-avatars`. Knowing an ID is not authorization.

Responses set `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and a restrictive sandbox content policy. PNG, JPEG, WebP, and GIF are served inline; other attachment types use a download disposition with an encoded filename. The route returns bytes, not signed Storage URLs. Access is rechecked on every request; CDN/shared caching must not bypass it.

### Account deletion

The request body cannot choose a user: the route derives the target from `getUser()`. It checks the request `Origin`, removes the caller's attachment objects and avatar objects through an isolated admin client, then deletes that Auth user and signs out locally. Without `SUPABASE_SECRET_KEY` or its legacy alternative, it returns `503`.

Auth deletion cascades profiles, settings, blocks, reactions, and memberships. Messages remain with `sender_id = null`; attachment uploader references may become null and their removed objects become unavailable. A remaining channel admin/member receives ownership when possible. An empty channel is not automatically deleted by the current ownership trigger. Storage cleanup and Auth deletion are separate operations, not one cross-service transaction; a failure can leave partial cleanup requiring an operator retry. Do not promise immediate invalidation of every already-issued JWT solely because a user was deleted. [Supabase user deletion behavior](https://supabase.com/docs/guides/auth/managing-user-data).

## Database reads and metadata

`src/types/database.generated.ts` is the generated schema, with application aliases/contracts in `src/types/database.ts`. Tables include `profiles`, `user_settings`, `conversations`, `conversation_members`, `messages`, `attachments`, `message_reactions`, and `blocked_users`. `media_usage` stores private per-user emoji/GIF/sticker usage. Internal rate buckets live in a non-exposed schema and have no browser mutation grant.

Direct browser writes to conversations, membership, messages, attachments, reactions, and blocks are denied. Use the RPCs below. Profiles/preferences have restricted self-update grants; the UI uses the atomic settings RPC.

`loadWorkspace` reads conversation/channel metadata, the authenticated profile directory ordered by display name with a 1,000-row cap, the caller's preferences, and caller-owned block records. The directory is therefore not guaranteed to contain every account in a larger installation. Message histories are fetched separately.

`list_conversations()` returns a JSON array. Each item includes the conversation table columns plus:

```ts
{
  unread_count: number;
  muted: boolean;
  last_read_at: string | null;
  last_read_message_id: string | null;
  cleared_at: string | null;
  members: Array<{
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    joined_at: string;
    last_read_at: string | null;
    last_read_message_id: string | null;
    cleared_at: string | null;
    muted: boolean;
    profile: ProfileRow;
  }>;
}
```

There is **no `messages` array** in this RPC. Cleared conversation previews are suppressed for that caller. `list_channels()` returns `{id,name,description,category,is_private,is_joined,is_owner,subscriber_count}[]` for public channels or joined private channels; it does not disclose message previews to outsiders.

### Message pagination

Read `messages` filtered by `conversation_id`, ordered by `created_at` and `id`, with a page size of 40. Initial and older pages use descending order, reversed for chronological rendering. An older cursor selects `created_at < time OR (created_at = time AND id < id)`; reconnect catch-up uses the corresponding greater-than predicate and ascending order. Timestamp alone is insufficient when messages collide in time.

Hydrate only the returned message IDs with attachments, reactions, and sender profiles. `messagesById` also filters the conversation. Reconciliation merges by message ID and orders by timestamp/ID. RLS hides messages and attached objects before the caller's `cleared_at`; clearing does not delete peers' history.

## Authenticated RPC contract

Use `supabase.rpc(name, args)` and check `error` before using `data`. UUIDs are strings in TypeScript. Timestamps are server-authored; callers cannot supply sender identities or message timestamps.

| RPC | Named arguments | Return and behavior |
| --- | --- | --- |
| `get_or_create_direct_conversation` | `other_user_id` | UUID; atomic symmetric pair; rejects self, missing contact, or either-direction block |
| `list_conversations` | None | JSON metadata array described above |
| `list_channels` | None | JSON channel catalog described above |
| `create_channel` | `channel_name`, `channel_description`, `channel_category`, `private_channel` | UUID; creates owner membership atomically |
| `set_channel_membership` | `target_conversation`, `joined` | Void; idempotent public join/leave, private invitation required, owner cannot leave |
| `invite_channel_member` | `target_conversation`, `target_user` | Void; owner/admin invitation, duplicate membership is a no-op |
| `send_message` | `target_conversation`, `message_content`, `client_id`, optional `attachment_ids` (default `[]`), optional `reply_to` (default null), `message_media` (default null), `used_emojis` (default `[]`) | JSON `MessageRow`; one message, not full history |
| `mark_conversation_read` | `target_conversation`, `read_message_id` | Void; verifies conversation and advances a monotonic timestamp/ID cursor |
| `set_conversation_muted` | `target_conversation`, `muted_value` | Void; caller's membership preference only |
| `set_reaction` | `target_message`, `reaction_emoji`, `active` | Void; explicitly set/remove caller's reaction, idempotently |
| `clear_my_history` | None | Void; advances caller's clear/read cursors across memberships |
| `set_blocked` | `target_user`, `blocked` | Void; caller-owned block, blocks new direct sends in either direction |
| `reserve_attachment` | `target_conversation`, `upload_id`, `file_name`, `mime_type`, `file_size` | JSON `AttachmentRow`; reserves metadata, not file bytes |
| `claim_attachment_discard` | `target_attachment` | Owned unbound attachment JSON, or null if unavailable/bound; locks out future sends before byte deletion |
| `discard_attachment` | `target_attachment` | Void; caller-owned, claimed uncommitted reservation; remove Storage object first |
| `update_my_settings` | `settings` JSON object | Void; atomic whitelist update |

Channel categories are `Engineering`, `Design`, `Product`, `General`, or `Random`. The channel RPC trims names and accepts 1–80 characters; descriptions are at most 1,000 characters. It does not enforce globally unique names or the old SQLite slug-normalization rule.

Settings keys are `theme`, `density`, `enterToSend`, `desktopNotifications`, `soundNotifications`, `displayName`, `statusMessage`, `avatar`, `presence`, and `role`. Unknown keys and incorrect value types fail the whole update. Theme is `light|dark`, density `cozy|compact`, presence `online|away|offline`. Display names are 1–100 characters; status messages up to 300; role labels up to 100. An avatar is empty, an HTTPS URL, or the caller's `avatar:<userId>/<uuid>` pointer. Binary/data URLs are not stored in PostgreSQL. The service removes displayed avatar proxy URLs and email from settings payloads.

### Send and retry guarantees

Message content is limited to **10,000 UTF-8 bytes**, not characters. A message must have non-whitespace content, attachments, or valid GIF/sticker media. At most five unique attachment IDs are accepted. Replies must reference a visible message in the same conversation. Current schema message types are `text`, `image`, `file`, `system`, `gif`, and `sticker`; ordinary emoji remain Unicode text. The browser cannot manufacture system messages through the send RPC.

Persist one `client_id` for each logical send. Repeating the same sender/client UUID returns the existing message only when conversation, content, reply target, attachment set, and media JSON match. Reusing it with a different payload fails. Generate a new ID when editing a failed draft. A successful send verifies membership, direct-message blocks, rate limits, attachment ownership/conversation, object existence, and finalized Storage size/MIME metadata. Message insert, attachment binding, media usage, read cursor, and conversation preview updates occur in one database transaction. Claimed attachments are rejected while holding the same row lock used by discard claims.

| Database action | Rolling per-user limit |
| --- | --- |
| New messages | 10 per 5 seconds |
| New direct conversations | 20 per 60 seconds |
| Channel creation | 10 per 60 seconds |
| New invitations | 30 per 60 seconds |
| Reaction state changes | 60 per 60 seconds |
| Attachment reservations | 20 per 60 seconds |

Idempotent DM/invitation/reaction no-ops do not consume their mutation quotas. SQL failures roll back database changes. These limits are separate from Supabase Auth limits, SMTP provider quotas, and edge/network limits.

## Private Storage workflow

1. Validate the file and call `reserve_attachment` with a fresh upload UUID and numeric byte size.
2. Upload bytes to the returned `storage_path` in `chat-attachments` using `upsert: false` and the validated content type. The authenticated uploader receives this internal path for the upload; UI links use attachment IDs instead.
3. Call `send_message` with the reservation IDs. A reservation alone is not a completed attachment.
4. Render `/api/attachments/:id`; the server performs fresh row and object authorization.
5. To abandon a staged upload, call `claim_attachment_discard`. Only if it returns a row, remove the returned Storage object, then call `discard_attachment`. A null result requires no deletion. Claims are retryable and serialize against sends; failed byte deletion retains the reservation for retry. Attached objects cannot be discarded through that RPC.

`chat-attachments` has a 25 MiB bucket limit; image reservations are additionally capped at 10 MiB. Files must be nonempty. The current reservation quota is 20 staged rows per user and 1 GiB total reserved attachment bytes. On authenticated workspace startup, the client attempts claim-based cleanup of up to 20 caller-owned unbound reservations older than 24 hours. This is not a scheduled server job; inactive accounts and failed cleanup still need operational maintenance.

The browser, database and bucket accept PNG/JPEG/WebP/GIF, PDF, plain text, CSV, ZIP, DOC/DOCX, XLS/XLSX and PPT/PPTX. Safe filename extensions fill in absent/generic MIME values; declared unsafe types remain rejected. The multipart File type is normalized to match the reservation. HTML, SVG, and executable MIME types are excluded.

Storage authorization preflight can contain null/empty metadata or only `mimetype`/`contentLength`. Policies validate supplied MIME and finalized `size` when present; HTTP `contentLength` is not the finalized file size. `send_message` independently requires the actual object's complete size and MIME metadata to match the reservation. Do not tighten preflight by requiring a field Storage has not yet populated, and do not weaken final commit verification.

Downloads require membership and a visible attached message, or ownership of a staged upload. The uploader can delete their staged objects only after an atomic discard claim; account cleanup uses the isolated admin route. Avatar objects use a separate private `profile-avatars` bucket, a 2 MiB cap, and the same four raster-image MIME types. Any authenticated directory user can read avatars; only the path owner can insert/delete; updates/upserts are not granted.

## Realtime

- Private `user:<userId>`: `conversation_changed` broadcast, payload `{conversation_id}`. Conversation/member triggers notify affected users, allowing new-DM/invitation discovery without subscribing to every message. The provider debounces metadata refreshes.
- Private `conversation:<conversationId>`: active-conversation Postgres changes for `messages` and `attachments`, filtered by `conversation_id`; `reaction_changed` broadcasts carry only `{message_id}`. The client hydrates that message rather than treating broadcast content as authoritative.
- Publication `supabase_realtime` includes `messages`, `attachments`, `message_reactions`, `conversations`, and `conversation_members`. Membership/read changes also generate lightweight inbox notifications.

Realtime topic RLS permits only the caller's inbox or a conversation they belong to. Conversation-topic send permission exists for member broadcasts, but the reviewed client does not implement live typing/presence; profile presence is persisted state. Clients cannot broadcast into user inboxes under the current insert policy.

A channel handshake triggers reconciliation; a successful `postgres_changes` system event confirms replication readiness and reconciles again. Reconnect/visibility/online handling refreshes loaded IDs and fetches messages after the latest cursor. Switching conversations or accounts tears down subscriptions; clearing history invalidates stale reads and restarts the active scope. Realtime is a notification transport, not a replacement for RLS-protected reads or cursor catch-up.

## Operations and verification

### Phase 1 media and personalization

The media migration adds nullable `messages.media` and private `media_usage` (user_id, type, media_id, use_count, last_used_at, metadata). It is applied remotely; detailed verification is tracked in VERIFICATION.md. `send_message` adds optional `message_media` JSON and `used_emojis` text array. Legacy callers can omit both. A GIF/sticker cannot share a message with file attachments; Unicode emoji remain ordinary text. Media-only messages may have empty text. The new message types are `gif` and `sticker` in addition to the existing types.

GIF payload: `{kind:'gif', provider:'giphy', id, title, previewUrl, mediaUrl, width, height}`. Server validation restricts provider, CDN URLs, dimensions, JSON size and fields. Sticker payload: `{kind:'sticker', id:'orb-v1-love'}`. Versioned asset IDs map to original static SVGs shipped in the application. Keep old pack versions available for persisted history.

`used_emojis` accepts up to 64 hints, each within the SQL validator and present in the current message text. The client omits unsupported grapheme hints without altering or rejecting ordinary Unicode text. Usage increments within the first successful send transaction. Retried sends do not increment it again. Only the owner can select usage rows under RLS; browser insert/update/delete is denied. The table is bounded to 500 entries per user/type. The UI ranks `3*log2(1+count) + 4*2^(-ageDays/7)` and supplies default emoji/stickers for new users. No private message history is downloaded to calculate suggestions.

GIPHY search/trending and lookup-by-ID use a small browser provider adapter, PG filtering, 24-item pages and bounded offsets. `NEXT_PUBLIC_GIPHY_API_KEY` is a GIPHY **public client key**, never a privileged secret. GIPHY requires client-side trending calls. No GIF binary is copied to Supabase Storage. The current workspace has this public key configured. Live browser search, trending, send, Recent and Frequently Used flows were verified during Phase 1. Another deployment must supply its own configured key; missing configuration yields an explicit error. Attribution is displayed in the picker. [GIPHY API documentation](https://developers.giphy.com/docs/api/).

Uploads start at file selection with concurrency two. Removed/unmounted drafts are discarded after any in-flight upload completes; submitted files remain intact while a send is unresolved. If a submitted send fails after unmount, its staged attachments are discarded through the claim workflow. Closing a browser process cannot guarantee immediate cleanup; the next authenticated workspace startup attempts the bounded stale-reservation cleanup described above. RPC success confirms the send immediately; detail hydration and inbox refresh do not determine send success. Optimistic and authoritative records reconcile by sender/client ID in either arrival order.

Use [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and [SMTP.md](SMTP.md) for production email. Unit/service tests mock transport boundaries. PGlite tests execute SQL/RLS but mock Auth/Storage/Realtime infrastructure; they do not certify hosted object handling or WebSocket delivery. Live tests must verify two users plus an outsider, real file bytes, read/clear behavior, reconnect, and private download denial. Record actual results in the separately maintained verification report.

