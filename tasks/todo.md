# Checklist sửa ChatFlow

Kế hoạch chi tiết: [plan.md](plan.md). Baseline `6941708`; T01–T19 đã triển khai và có evidence local ngày 15/10/2026 ở [../docs/VERIFICATION.md](../docs/VERIFICATION.md).
Checkbox ghi nhận implementation/local acceptance. Các verification có điều kiện staging/cloud/manual EXE chưa chạy được ghi riêng trong báo cáo và không được coi là kết quả live.
Quy mô S = 1–2 file chính, M = 3–5 file chính; chia tiếp nếu implementation vượt 5 file độc lập.

## T01 — Packet validation và connection error containment

Mục tiêu: input sai không làm gateway process dừng hoặc tạo async rejection không xử lý.

- [x] Kiểm tra packet object/type/direction/field bounds trước dispatch, không tin type assertion.
- [x] Bắt mọi dispatch rejection, serialize application packets và reject oversized payload trước allocation không cần thiết.
- [x] Connection lỗi bị giới hạn riêng; valid peers vẫn send/receive được.

Verification: gateway test mới cho malformed/null/wrong-type, invalid JSON, frame budget và valid peer continuity; `npm --prefix gateway test`.
Phụ thuộc: không. Quy mô M.
Files: `gateway/src/server.ts`, `gateway/src/websocket-codec.ts`, `gateway/src/packet-validation.ts` (mới), `gateway/test/packet-validation.test.mjs` (mới), `gateway/test/gateway-e2e.test.mjs`.

## T02 — Mandatory membership provider

- [x] Production startup cấu hình provider bắt buộc, không có permissive fallback.
- [x] User JWT/RLS xác minh join và protected operations/delivery; user đã leave hoặc ngoài phòng bị từ chối.
- [x] Timeout/provider unavailable fail closed; test provider được inject nhưng client không chọn provider.

Verification: provider unit/stub tests + gateway negative/positive room tests; gateway build/test.
Phụ thuộc: T01. Quy mô M.
Files: `gateway/src/supabase-authorizer.ts` (mới), `gateway/src/server.ts`, `gateway/src/index.ts`, `gateway/test/authorizer.test.mjs` (mới), `gateway/test/gateway-e2e.test.mjs`.

## T03 — Authenticated session lifecycle

- [x] Deadline HELLO, verified subject/expiry và re-auth cùng subject được thực thi.
- [x] Client đợi auth ACK trước JOIN/SEND; token refresh xác minh lại socket, expired session không giữ quyền.
- [x] Anonymous peers không nhận presence; timers/connections/auth work được cleanup và bounded.

Verification: expiry/deadline/re-auth tests bằng injectable clock/provider; gateway tests và root typecheck.
Phụ thuộc: T01. Quy mô M.
Files: `gateway/src/server.ts`, `gateway/src/protocol.ts`, `src/services/gateway-client.ts`, `gateway/test/session-lifecycle.test.mjs` (mới), `src/test/gateway-client.test.ts` (mới).

## Checkpoint A

- [x] T01–T03 pass; invalid/nonmember/expired input không làm hỏng valid peer.
- [x] Protocol contract và planned migration shape review được; không deploy các thay đổi riêng lẻ chưa tương thích.

## T04 — NULL-safe ownership RPC

- [x] Migration mới thay edit/delete owner check bằng NULL-safe predicate và current membership check.
- [x] Orphan/nonmember/former-member/wrong-author bị từ chối; đúng tác giả còn member thành công.
- [x] Row locking, empty search_path và execute allowlist giữ đúng.

Verification: extend `npm run test:db` với post-account-deletion và former-member cases.
Phụ thuộc: không. Quy mô S.
Files: new ownership migration trong `supabase/migrations/`, `scripts/test-database.mjs`.

## T05 — Recall audit/redaction và protected bytes

- [x] Private audit không có browser grants; public row được redact atomically, tombstone còn ID/cursor và media constraints hợp lệ.
- [x] Raw recipient reads/Realtime/reply không nhận original; attachment/reaction/Storage reads sau recall bị từ chối.
- [x] Backfill recalled rows cũ và rollback transaction được kiểm tra; đang đọc/upload không bypass state mới.

Verification: PGlite raw reads và audit/grants tests cho text/file/GIF/sticker, tombstone pagination và upgrade fixture; cloud Storage verification tại staging checkpoint.
Phụ thuộc: T04. Quy mô M.
Files: new recall migration, `scripts/test-database.mjs`, `scripts/test-cloud.mjs`, `src/services/messages.ts` (nếu mapping cần đổi), `src/test/services.test.ts`.

## T06 — Preview sau edit/recall

- [x] Latest edit cập nhật preview; old-message edit không đổi ordering/latest ID.
- [x] Latest recall không giữ original text trong sidebar; data cũ được recompute an toàn.
- [x] Inbox notification, clear-history và unread/read cursor không regression.

Verification: `list_conversations` assertions sau edit/recall/clear và timestamp collision; `npm run test:db`.
Phụ thuộc: T05. Quy mô S.
Files: new preview migration, `scripts/test-database.mjs`.

## Checkpoint B1

- [x] T04–T06 migration replay và upgrade fixture pass.
- [x] Các case NULL ownership, raw recalled read và stale preview đã đổi từ lỗi baseline thành regression pass.

## T07 — Verified gateway notifications

- [x] DB xác nhận message/conversation/ownership/state trước ACK/delivery; cache hoặc packet sender không cấp quyền.
- [x] Protocol mới chỉ broadcast committed-change IDs; unknown/wrong-conversation/uncommitted ID bị từ chối.
- [x] Version handshake và recipient authorization fail closed, event duplicate không tạo mutation mới.

Verification: gateway tests với provider stub mô phỏng persisted state, wrong owner và unknown ID; root typecheck.
Phụ thuộc: T02, T03, T04, T05. Quy mô M.
Files: `gateway/src/server.ts`, `gateway/src/protocol.ts`, `gateway/src/supabase-authorizer.ts`, `gateway/test/message-authority.test.mjs` (mới), `gateway/test/gateway-e2e.test.mjs`.

## T08 — Một receiver reconciliation path

- [x] Gateway IDs và Supabase Realtime dùng cùng database hydrate/merge path; bỏ direct full-payload updates.
- [x] Optimistic send, duplicate/out-of-order event và reconnect không nhân đôi message/unread.
- [x] Clear/logout/recall generation guards giữ đúng; SQL success không phụ thuộc gateway ACK.

Verification: frontend regressions cho forged payload, event ordering/dedup/unread/clear/logout; `npm test`, typecheck.
Phụ thuộc: T07. Quy mô M.
Files: `src/services/gateway-client.ts`, `src/services/realtime.ts`, `src/context/ChatFlowContext.tsx`, `src/test/chatflow.test.tsx`, `src/test/services.test.ts`.

## Checkpoint B2

- [x] T07–T08 protocol/server/client tương thích; two-session local chat không cần reload.
- [x] Send/edit/recall chỉ phản ánh committed database state.

## T09 — Upload ID, owner và filesystem boundary

- [x] FILE_START require membership; server cấp UUID và manifest owner/conversation/storage name.
- [x] Display filename không thành path; root containment, symlink guard và exclusive writes được kiểm tra Windows/POSIX.
- [x] Wrong owner/collision không sửa session hoặc completed bytes; client đợi ACK hợp lệ.

Verification: isolated temporary filesystem gateway tests với traversal/collision/owner/restart; gateway tests + typecheck.
Phụ thuộc: T02, T03. Quy mô M.
Files: `gateway/src/file-transfers.ts` (mới), `gateway/src/server.ts`, `gateway/src/protocol.ts`, `src/services/gateway-client.ts`, `gateway/test/file-transfers.test.mjs` (mới).

## T10 — Upload budgets và cleanup

- [x] File/image/per-user/global budgets, chunk ranges/count/cumulative bytes/digest được thực thi; packet 32 KiB binary fit frame limit.
- [x] ACK pacing/backpressure và duplicate handling không tăng bytes/quota sai.
- [x] Abort/disconnect/idle expiry/restart cleanup giải phóng drafts và quota, chỉ trong storage root.

Verification: deterministic small-budget tests, corruption/timeout/disconnect/retry và repeated valid sessions; không dùng disk exhaustion thực tế.
Phụ thuộc: T09. Quy mô M.
Files: `gateway/src/file-transfers.ts`, `gateway/src/server.ts`, `gateway/src/index.ts`, `src/services/gateway-client.ts`, `gateway/test/file-transfers.test.mjs`.

## T11 — Authorized gateway download

- [x] Short-lived file/user/conversation capability dùng secret riêng trên host; current membership được recheck khi tải.
- [x] Anonymous/raw URL, expired capability và revoked membership bị từ chối; metadata manifest không được serve.
- [x] Private/no-store, nosniff/disposition đúng; browser transfer link hoạt động, secret không vào client.

Verification: gateway HTTP download tests cho valid/expired/wrong-recipient/leave; gateway tests + typecheck.
Phụ thuộc: T09, T10. Quy mô M.
Files: `gateway/src/file-transfers.ts`, `gateway/src/server.ts`, `gateway/src/index.ts`, `src/services/gateway-client.ts`, `gateway/test/file-transfers.test.mjs`.

## Checkpoint C

- [x] T09–T11 valid chunked roundtrip pass; filesystem/owner/quota/download negatives pass.
- [x] Supabase upload UI còn hoạt động; restart giữ authorization completed files.

## T12 — Block-aware database profile projection

- [x] Raw profile presence không bypass block; caller-scoped projection che hai chiều và own presence còn đúng.
- [x] JSON RPC/profile embeddings như list_conversations không lộ presence; danh bạ cơ bản và unblock vẫn dùng được.
- [x] New grants/search_path/RLS/type schema đúng và không cấp quyền đọc private helper.

Verification: PGlite raw SELECT/column/RPC tests cho self/peer/blocked/both-directions/anon; local type generation.
Phụ thuộc: không. Quy mô M.
Files: new presence migration, `scripts/test-database.mjs`, `src/types/database.generated.ts`, `src/types/database.ts`.

## T13 — Client dùng sanitized profiles

- [x] Workspace, sender hydration và own settings dùng projection mới thay SELECT * sensitive table.
- [x] Blocked contact còn name/avatar và presence ẩn; profile settings vẫn save/load đúng.
- [x] Pagination/messages/read status không regression sau đổi profile contract.

Verification: frontend service/view tests cho block/unblock và own-profile; typecheck + `npm test`.
Phụ thuộc: T12. Quy mô M.
Files: `src/services/workspace.ts`, `src/services/messages.ts`, `src/context/ChatFlowContext.tsx`, `src/test/services.test.ts`, `src/test/views.test.tsx`.

## T14 — Gateway presence privacy

- [x] Chỉ valid authenticated recipients được nhận activity; block hai chiều được kiểm tra tại delivery.
- [x] Block/unblock/expiry/leave cập nhật recipient scope, không dùng renderer cache làm quyền.
- [x] Provider unavailable không fallback global broadcast; typing identity/membership vẫn đúng.

Verification: gateway presence tests có anonymous/blocked/unblocked/expired peers và provider failure.
Phụ thuộc: T02, T03, T12. Quy mô M.
Files: `gateway/src/server.ts`, `gateway/src/supabase-authorizer.ts`, `gateway/test/presence-privacy.test.mjs` (mới).

## Checkpoint D1

- [x] T12–T14 DB và gateway cùng tuân theo block presence; direct API không bypass.
- [x] Client migration release phối hợp với profile grants, không publish UI cũ trên schema mới.

## T15 — Cleanup draft sau leave

- [x] Uploader list/claim/delete unbound claimed draft sau leave mà không được đọc bytes/history.
- [x] Quota reservation được giải phóng; unrelated uploader không cleanup được draft.
- [x] Send-vs-discard vẫn serialize; attachment đã bind không bị xóa bằng cleanup route.

Verification: PGlite leave/reinvite/quota tests; attachment service regression và staged cloud Storage race tests sau deployment.
Phụ thuộc: T05. Quy mô M.
Files: new draft-cleanup migration, `scripts/test-database.mjs`, `src/services/storage.ts`, `src/test/services.test.ts`, `scripts/test-attachment-flow.mjs`.

Implementation dependency bổ sung: SELECT RLS chặn direct Storage DELETE sau leave; dùng hosted POST `/api/attachments/:id/discard` do T17 route/helper sở hữu, với user claim → admin byte deletion → user finalize. Không cấp SELECT bytes để giải quyết cleanup.

## T16 — Account-retention disclosure

- [x] Description và confirmation nói đúng messages được giữ, profile/files được cleanup; không hứa xóa content chưa xóa.
- [x] Success chỉ sau cleanup endpoint thành công; lỗi/partial cleanup có trạng thái có thể retry.
- [x] API docs khớp FK orphan và ownership policy mới.

Verification: view tests với confirmation text và failed deletion; review docs đối chiếu endpoint/schema.
Phụ thuộc: T04. Quy mô M.
Files: `src/components/settings/SettingsView.tsx`, `src/test/views.test.tsx`, `docs/API.md`.

## Checkpoint D2

- [x] T15–T16 lifecycle và disclosure nhất quán; không còn stranded draft sau leave.
- [x] Chính sách retention đã review trong implementation; không tự xóa lịch sử người khác.

## T18 — Public configuration allowlist cho EXE

- [x] Không copy whole .env.local; chỉ public configuration allowlist được xuất ra standalone.
- [x] Secret scan kiểm tra static và standalone/package tree với fake-sensitive fixture, không in credential thật.
- [x] CI chạy secret gate trước packaging; desktop login/project config còn hoạt động.

Verification: prepare-standalone/secret-policy tests, `npm run build`, `npm run test:secrets`, staged electron bundle inspection.
Phụ thuộc: không. Quy mô M.
Files: `scripts/prepare-standalone.mjs`, `scripts/check-client-secrets.mjs`, `.github/workflows/build-exe.yml`, `src/test/standalone-config.test.ts` (mới), `electron-builder.json` nếu cần exclude policy.

## T17 — Desktop self-delete qua hosted server

- [x] Hosted handler xác minh bearer/cookie identity riêng, chỉ delete verified user; web cookie flow vẫn kiểm tra CSRF/Origin.
- [x] Local session/origin hợp lệ forward user token tới trusted configured HTTPS endpoint với timeout; target không từ client.
- [x] EXE không cần admin key; unavailable/expired/foreign-origin/wrong-user/remote-error cases không có unsafe fallback.

Verification: local hosted stub + route tests; extend auth script cho web/desktop identity/origin; staged packaged EXE self-delete sau hosted endpoint được cấu hình.
Phụ thuộc: T16, T18. Quy mô M.
Files: `src/lib/account-deletion.ts` (mới), `src/app/api/[...path]/route.ts`, `src/app/auth/callback/route.ts`, `electron/main.cjs`, `src/test/account-deletion.test.ts` (mới), `src/test/auth-callback.test.ts` (mới), `scripts/test-auth-callback.mjs`. Callback/NextURL integration fix được ghi cùng T17.

## Checkpoint E

- [x] T18 và T17 pass; origin protection còn đúng; không có admin key trong distribution.
- [x] Operator target/hosted endpoint được xác định trước live self-delete test; desktop auth callback behavior được kiểm tra và gap được ghi rõ.

## T19 — Integration, CI và rollout documentation

- [x] Chạy full local test/typecheck/build/secret suite và meaningful two-session user flows; từng finding có test/control evidence mới.
- [x] Docs mô tả protocol version, migrations/profile projection, retention, gateway quotas/private downloads và desktop hosted endpoint.
- [x] Rollout/migration order, compatibility, live gaps và rollback forward-fix được ghi rõ; không phát hành khi chưa verify phần được claim.

Verification: `npm run typecheck`, `npm test`, `npm run test:db`, `npm --prefix gateway test`, `npm run build`, `npm run test:secrets`; staging cloud/auth/attachment tests và EXE manual checks khi target đã được thiết lập.
Phụ thuộc: T01–T18 hoàn tất. Quy mô M; nếu integration cần thêm code fix, mở task riêng trước sửa.
Files: `docs/API.md`, `docs/TECHNICAL_DOCUMENTATION.md`, `docs/DEPLOYMENT.md`, `docs/VERIFICATION.md`, `.github/workflows/build-exe.yml`, `scripts/test-local-gateway.mts`, `scripts/test-package.mjs`, `package.json`. Hai script integration được tách theo transport và packaged runtime.

## Checkpoint hoàn tất

Integration additions trong T19: sửa loopback NextURL/callback và backfill preview đã tái hiện bằng regression. Bổ sung T19.3 trước khi sửa: cleanup account phải phân trang metadata thay vì phụ thuộc giới hạn 1.000 dòng mặc định của PostgREST; test 1.001 attachment, cleanup lỗi vẫn dừng trước identity deletion.

- [x] 12 finding đều có source/test evidence đóng, 4 lỗi chức năng được xử lý, secret-copy risk được ngăn.
- [x] Không còn unchecked task; mọi external check chưa chạy được ghi là chưa xác minh.
- [x] Review implementation diff và chốt kết quả trước deploy/publish; không tự xem kế hoạch là quyền phát hành.
