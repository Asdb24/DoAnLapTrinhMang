# Cleanup thận trọng — 15/10/2026

Baseline trước cleanup: `b8c6fc992950d62bf436cc10c988f5bc20244ba1`. Working tree ban đầu sạch. Phạm vi là code/dependency đã xác nhận không dùng hoặc đã lỗi thời; không sửa schema, dữ liệu, protocol hay quyền production.

## Cách xác nhận

- Đọc quy ước entry point Next.js trong bộ docs của phiên bản cài đặt. Giữ mọi page/layout/route/proxy, kể cả khi không có import trực tiếp.
- Dùng TypeScript AST/module resolution để lần theo imports, re-exports, literal import()/require() từ 11 entry point app và riêng các test. Sau đó tìm toàn repo, đọc call site, package scripts, CI và cấu hình Electron trước khi xóa.
- Chạy TypeScript với noUnusedLocals/noUnusedParameters để xác nhận import/parameter thừa. Trước sửa có 28 chẩn đoán unused; sau sửa không còn lỗi ở hai chế độ này.
- Mọi file xóa đều đã có trong Git ở baseline; có thể đối chiếu/khôi phục từng file từ commit đó. Không xóa dữ liệu người dùng, cấu hình local, asset sticker, lịch sử migration hoặc thư mục backup.

## Thành phần đã dọn

| Thành phần | Evidence và cách xử lý |
| --- | --- |
| src/components/chat/ChatListSidebar.tsx | Không reachable từ app; chỉ được views.test.tsx import. App dùng AppSidebar từ root layout. Chuyển test unread/group sang AppSidebar thật, bổ sung direct/search và kiểm tra không tải history; test pass trước khi xóa component cũ. |
| src/components/ui/breadcrumb.tsx | Không có importer/re-export/consumer trong app, test, config hoặc scripts; bỏ file primitive không dùng. |
| src/components/ui/collapsible.tsx | Không có consumer. Sidebar đang dùng trạng thái collapse riêng và Sheet, không import primitive này; bỏ file. |
| scripts/api-smoke.mjs | Gọi các endpoint SQLite cũ như /api/state, /api/auth/register, /api/migrate. Runtime và LEGACY_API.md xác nhận các route này đã bỏ. Các script Supabase hiện hành vẫn được giữ. |
| scripts/test-live-gateway-chat.mjs | HELLO không có version, user/room ID mẫu không phải UUID, tự ký JWT bằng fallback secret, chờ NEW_MSG/MSG_EDITED/MSG_DELETED của protocol cũ. Không tương thích protocol 2.0; thay lệnh README bằng test:local đã tồn tại và ghi rõ phạm vi local. |
| zod | Không có consumer/import hoặc cấu hình sử dụng trong source/scripts. Gỡ direct dependency. |
| @radix-ui/react-collapsible | Consumer duy nhất là primitive không dùng nói trên. Gỡ direct dependency và ba package nested không còn reachable. |
| gateway/src/server.ts: verifyHs256Jwt/JwtPayload | Không có call site. Production xác thực qua SupabaseAuthorizer; bỏ verifier/type cũ. |
| createTestJwt | Còn cần cho authorizer tests; chuyển nguyên chức năng sang gateway/test/helpers.mjs, cập nhật import của test. Không xóa test xác thực. |
| Imports và state destructuring thừa | Bỏ các React default imports, icon/UI imports và settings destructuring được TypeScript xác nhận unused. Giữ named hooks, React namespace thực sự dùng cho type/value và component hiện hành. |
| SettingsView onClose | Callback không bao giờ được dùng trong component. Bỏ prop và giá trị truyền từ SettingsDialog; Dialog vẫn dùng onOpenChange để đóng. |
| src/test/setup.ts: json | Export chỉ có một import không dùng; bỏ helper và import thừa. Các mock boundary khác được giữ. |

Npm uninstall chạy offline, ignore-scripts. So sánh lockfile xác nhận chỉ mất năm package entries nêu trên; không đổi version hoặc metadata của bất kỳ package còn lại. README cập nhật các ví dụ protocol/tải file và lệnh test liên quan, để không tiếp tục hướng dẫn chạy script đã bỏ.

## Thành phần chủ động giữ

| Thành phần | Lý do |
| --- | --- |
| AppSidebar, NavUser, /login và LoginForm | Có đường tham chiếu thật từ root layout hoặc route. Không coi tên giống template là bằng chứng không dùng. |
| theme-config.ts, theme.css, src/config/theme-config.ts, src/styles/theme.css | Là các entry/reference thiết kế và token. Runtime dùng globals.css; chưa đủ bằng chứng để kết luận chủ ý xuất design tokens đã bị bỏ. Giữ để tránh xóa nhầm tài nguyên thiết kế. |
| Gateway chunked upload/download | Có client API, gateway handlers và integration tests; thuộc mục tiêu đồ án dù composer hiện dùng Supabase Storage. |
| Toàn bộ migrations/bootstrap và database types | Cần cho replay, nâng cấp dữ liệu cũ, RLS và typed RPC contracts. |
| Cloud/auth/attachment/cleanup scripts | Là entry point vận hành thủ công; không được xác định là dead code chỉ vì không có importer. |
| Các UI primitive còn được tham chiếu và test fixtures | Còn phục vụ app, component contracts hoặc regression coverage. |
| docs/LEGACY_API.md | Được API.md tham chiếu; là tài liệu lịch sử/migration, không phải executable cũ. |

## Kiểm chứng

| Check | Kết quả |
| --- | --- |
| npm run typecheck -- --noUnusedLocals --noUnusedParameters | PASS |
| npm test | PASS: 176 tests / 11 files; không giảm số test |
| npm --prefix gateway test | PASS: 29 tests |
| npm run test:local | PASS: hai frontend adapter thật qua TCP, send/edit/recall và file bytes |
| npm run build | PASS: production Next.js/standalone, các route cũ vẫn được tạo |
| npx electron-builder --win --dir --publish never | PASS: gói Windows unpacked được tạo lại từ build cleanup |
| npm run test:package | PASS: health, login HTML/client script, callback loopback và origin/auth guards trên packaged runtime |
| npm run test:secrets sau đóng gói | PASS: 4.228 browser/standalone/distribution artifacts |
| git diff --check | PASS |

Trong lần gateway test chạy cùng frontend/typecheck, fixture expiry 100 ms hết hạn trước PONG. Đã giữ thời gian logic cố định trong setup, chỉ advance sau PONG rồi kiểm tra timer production đóng socket. Đây là sửa tính ổn định của test; không tăng timeout hoặc đổi expiry rule production.

AST graph sau cleanup chỉ còn theme-config ngoài runtime graph, được giữ có chủ ý. Static graph không chứng minh mọi consumer bên ngoài repo; vì vậy không tự cắt exports trong các module UI/service còn dùng hoặc xóa design/config entry points.

DB migrations, cloud và VPS không bị thay đổi; không chạy live tests tạo/xóa tài khoản. Bộ SQL không chạy lại trong lượt cleanup vì không sửa SQL hoặc dependency của PGlite. Kết quả Linux của lượt remediation trước không được xem là một lần chạy lại cho cleanup này. Bản cleanup hiện nằm ở working tree để review.
