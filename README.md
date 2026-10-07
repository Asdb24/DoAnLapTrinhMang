# ChatFlow

Ứng dụng nhắn tin và cộng tác nhóm được xây dựng bằng Next.js, React, TypeScript và Supabase.

## Thành viên

- Trần Nguyễn Quốc Vinh — 23DTHJA1 — 2380602569
- Trần Toàn — 23DTHJA1 — 2380602277
- Trần Đức Huy — 23DTHJA1 — 2380600888

## Công nghệ sử dụng

- Next.js 16 và React 19
- TypeScript
- Tailwind CSS và các component theo phong cách shadcn/ui
- Supabase Auth
- PostgreSQL, Row Level Security (RLS) và RPC
- Supabase Realtime
- Supabase Private Storage
- Vitest và Testing Library

## Chức năng chính

- Đăng ký, đăng nhập, đăng xuất và khôi phục mật khẩu qua Supabase Auth.
- Nhắn tin trực tiếp và trò chuyện trong các channel công khai hoặc riêng tư.
- Gửi emoji, GIF GIPHY, sticker Little Orbs và reaction.
- Gửi file đính kèm với kiểm tra loại file, kích thước, retry và cleanup upload lỗi.
- Đồng bộ tin nhắn theo thời gian thực bằng Supabase Realtime.
- Phân trang lịch sử tin nhắn theo cursor `(created_at, id)`.
- Trạng thái đã đọc, mute conversation, block user và xóa lịch sử cá nhân.
- Cài đặt giao diện sáng/tối, mật độ tin nhắn, trạng thái và thông báo.
- Xóa tài khoản cùng các file do người dùng tải lên.

## Yêu cầu môi trường

- Node.js >= 22.13.0
- Một project Supabase
- Supabase CLI nếu cần chạy migration hoặc kiểm tra database

## Cài đặt và chạy local

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev -- --port 3100
```

Mở [http://localhost:3100](http://localhost:3100).

## Cấu hình biến môi trường

Tối thiểu cần cấu hình trong `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_APP_URL=http://localhost:3100
```

Để bật tìm kiếm GIF, thêm public key của GIPHY:

```env
NEXT_PUBLIC_GIPHY_API_KEY=your-public-giphy-key
```

Các biến bí mật như `SUPABASE_SECRET_KEY` hoặc `SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng phía server. Không đặt chúng trong biến bắt đầu bằng `NEXT_PUBLIC_` và không commit `.env.local`.

## Database và Supabase

Để sử dụng một project Supabase mới:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:migrate
npm run db:types
```

Sau khi migrate, cần cấu hình trong Supabase:

- Auth redirect URL cho `/auth/callback`.
- Email confirmation và password tối thiểu 10 ký tự.
- Realtime private channels; tắt public access nếu không cần.
- SMTP riêng trước khi triển khai cho người dùng thật.

Chi tiết xem [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) và [docs/SMTP.md](docs/SMTP.md).

## Kiến trúc thư mục

```text
src/app/                  Các route và page của Next.js
src/components/           Thành phần giao diện chat, channel, settings
src/context/              State và action chính của ứng dụng
src/services/             Message, media, storage, workspace, realtime
src/lib/supabase/         Supabase client phía browser/server
gateway/                  ChatFlow Realtime Gateway (Node.js, WebSocket)
electron/                 ChatFlow Desktop Client (Electron)
src/types/                Kiểu dữ liệu ứng dụng và database
supabase/migrations/      Migration PostgreSQL, RPC, RLS, Storage
scripts/                  Script kiểm thử và kiểm tra cloud
docs/                     Tài liệu API, triển khai và xác minh
```

Ứng dụng sử dụng Supabase PostgreSQL kết hợp ChatFlow Realtime Gateway cho kiến trúc microservices phân tán và đồng bộ thời gian thực bảo mật cao.

## Luồng gửi tin nhắn

1. Client tạo message optimistic để giao diện phản hồi ngay.
2. File được upload trước khi gửi với giới hạn tối đa hai upload đồng thời.
3. RPC `send_message` kiểm tra membership, block, rate limit, attachment và idempotency.
4. Database ghi message bằng `client_message_id` để retry không tạo tin nhắn trùng.
5. Realtime đồng bộ message tới các thành viên trong conversation.
6. Client hydrate lại sender, attachment và reaction từ Supabase.

## Giới hạn chính

- Nội dung tin nhắn: tối đa 10.000 byte UTF-8.
- Tối đa 5 file trong một tin nhắn.
- Ảnh: tối đa 10 MB.
- File khác: tối đa 25 MB.
- Avatar: tối đa 2 MB.
- Tối đa 20 upload chưa gắn vào tin nhắn mỗi người dùng.
- Tối đa 1 GB dung lượng attachment đã khai báo mỗi người dùng.

Database sử dụng RLS và các RPC có kiểm tra `auth.uid()`. Storage là private; URL tải file không chứa storage path và quyền truy cập được kiểm tra lại ở mỗi request.

## Kiểm thử

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

`test:cloud` và `test:auth` cần cấu hình Supabase server key trong `.env.local`. Các script cloud tạo dữ liệu kiểm thử riêng và có lệnh cleanup:

```powershell
npm run test:cloud:cleanup
```

## Tài liệu liên quan

- [API contract](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [SMTP](docs/SMTP.md)
- [Verification report](docs/VERIFICATION.md)
- [Legacy API](docs/LEGACY_API.md)
