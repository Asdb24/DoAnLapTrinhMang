# Historical API — not the production contract

This document preserves useful reference material from the former ChatFlow SQLite backend. These routes, session rules, and deployment settings are **obsolete**. Do not use this document to build a new integration or configure production. The current contract is [API.md](API.md), backed by Supabase Auth, PostgreSQL, RPC, Realtime, and private Storage.

## Former runtime and sessions

The old Node backend used `data/chatflow.sqlite`, optionally selected through `DATABASE_PATH`. Authentication issued an HttpOnly `chatflow_session` cookie. `COOKIE_SECURE`, `APP_ORIGIN`, and `CHATFLOW_DEMO` controlled parts of that runtime. They are not the configuration contract for the Supabase application.

Login, registration, and most mutations returned an entire caller-specific workspace, including complete message histories. The UI polled `GET /api/state` every five seconds. The replacement loads metadata separately, uses bounded cursor pagination for messages, and subscribes to scoped Supabase Realtime channels.

## Removed route families

| Historical endpoint | Former purpose | Current equivalent |
| --- | --- | --- |
| `GET /api/state` | Full workspace and message history | `loadWorkspace`, metadata RPCs, paged table reads |
| `GET /api/auth/options` | Discover demo access | Removed |
| `POST /api/auth/register`, `/login`, `/logout` | SQLite account/session management | Supabase Auth SDK |
| `POST /api/auth/demo` | Seed and sign in to a local demo | Removed |
| `POST /api/conversations` | Create/reuse a DM | `get_or_create_direct_conversation` RPC |
| `POST /api/channels` | Create a channel | `create_channel` RPC |
| `POST /api/channels/:id/open` | Open a joined channel | Client selection and, when necessary, membership RPC |
| `PUT /api/channels/:id/membership` | Join/leave | `set_channel_membership` RPC |
| `POST /api/channels/:id/members` | Invite contact | `invite_channel_member` RPC |
| `POST /api/conversations/:id/messages` | Send and return full state | `send_message` RPC |
| `PUT /api/conversations/:id/read` | Advance a sequence cursor | `mark_conversation_read` RPC |
| `PATCH /api/conversations/:id/preferences` | Mute | `set_conversation_muted` RPC |
| `POST /api/conversations/:id/messages/:messageId/reactions` | Toggle a reaction | Explicit `active` flag in `set_reaction` RPC |
| `PATCH /api/settings` | Save profile/preferences | `update_my_settings` RPC |
| `PUT` / `DELETE /api/blocked/:id` | Block/unblock | `set_blocked` RPC |
| `DELETE /api/history` | Clear caller's history | `clear_my_history` RPC |
| `POST /api/uploads` | Multipart application-server upload | Reservation RPC, then Supabase Storage upload |
| `GET /api/uploads/:id` | Download legacy uploaded bytes | `/api/attachments/:id` for current attachment IDs |
| `POST` / `GET /api/migrate` | Import/download browser-local backup | No current production migration endpoint |

`GET /api/health` and `DELETE /api/account` still exist, but their current responses, authorization, and deletion semantics are documented in [API.md](API.md). Do not carry their old implementation assumptions forward.

## Interpreting old backups

The old import accepted arrays of conversations and channels plus settings. Imported conversations became isolated, caller-owned, read-only archives. Historical sender names were labels, not authenticated identities. Imported IDs could not grant membership in live private conversations.

A legacy message could contain `id`, `senderName`, `content`, `isSentByMe`, `date`, `timestamp`, and attachment metadata. Filenames and formatted sizes do not contain file bytes. A stored URL may be unavailable or untrusted; it is not evidence of a current authorized Storage object. Historical reactions cannot safely be attributed to current Supabase users without a verified mapping.

The former service recorded the accepted JSON backup and a per-account `migrationCompleted` flag. That workflow is not active in the Supabase runtime. The remaining UI/domain compatibility field does not imply that an import ran. Preserve original backups separately; do not delete browser data on the assumption that Supabase has imported it.

## Deliberate semantic differences

- Old messages used integer sequence cursors and allowed up to 20,000 characters. Current messages use a `(created_at, id)` cursor and a 10,000-byte content limit.
- Old reactions toggled on every call, making blind retries unsafe. The current RPC sets a requested state idempotently.
- Old uploads used different limits and URLs. Current attachments require a reservation in the same conversation and a verified Storage object; abandoning one requires the atomic discard-claim workflow described in API.md.
- Old account deletion removed authored messages. Current foreign keys preserve messages and null the deleted sender; uploaded objects are removed by the account route.
- Old demo seeding and SQLite smoke-test instructions are not production deployment steps.

This history is a migration reference, not a compatibility guarantee. Any future legacy import needs its own authenticated, isolated design and tests.
