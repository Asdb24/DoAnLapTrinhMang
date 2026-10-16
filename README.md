# ChatFlow — Ứng Dụng Nhắn Tin Thời Gian Thực Phân Tán (Đồ Án Lập Trình Mạng)

[![Release v0.4.1](https://img.shields.io/badge/release-v0.4.1-blue.svg)](https://github.com/Asdb24/DoAnLapTrinhMang/releases/tag/v0.4.1)
[![Platform Windows](https://img.shields.io/badge/platform-Windows%20x64-green.svg)](https://github.com/Asdb24/DoAnLapTrinhMang/releases/tag/v0.4.1)
[![Protocol RFC 6455](https://img.shields.io/badge/protocol-RFC%206455%20WebSocket-orange.svg)](docs/TECHNICAL_DOCUMENTATION.md)
[![Database Supabase PostgreSQL](https://img.shields.io/badge/database-PostgreSQL%20RLS-336791.svg)](docs/API.md)
[![Verification](https://img.shields.io/badge/tests-verification-blue.svg)](docs/VERIFICATION.md)

ChatFlow là ứng dụng nhắn tin và cộng tác nhóm thời gian thực phân tán, kết hợp giữa kiến trúc **Next.js 16 + React 19 + Electron Desktop**, cơ sở dữ liệu **Supabase PostgreSQL (Row Level Security & RPC)** và **Custom Gateway Server (RFC 6455 WebSocket)** tự viết từ socket TCP thuần chạy trên **Oracle Cloud VPS**.

---

## 👥 Nhóm Thực Hiện Đề Tài

| STT | Họ và Tên | Lớp | Mã Số Sinh Viên | Vai trò |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **Trần Nguyễn Quốc Vinh** | 23DTHJA1 | `2380602569` | Trưởng nhóm / Phát triển hệ thống |
| 2 | **Trần Toàn** | 23DTHJA1 | `2380602277` | Thành viên / Cơ sở dữ liệu & Backend |
| 3 | **Trần Đức Huy** | 23DTHJA1 | `2380600888` | Thành viên / Giao diện & Gateway Mạng |

---

## 🚀 Tải Bản Cài Đặt Desktop (.exe) Đã Đóng Gói Sẵn

Ứng dụng Windows Desktop đã được đóng gói tự động qua GitHub Actions CI/CD và kết nối sẵn với máy chủ Cloud thật (không cần cấu hình `.env`):

* 📦 **Tải bản cài đặt NSIS:** [ChatFlow Setup 0.4.1.exe](https://github.com/Asdb24/DoAnLapTrinhMang/releases/download/v0.4.1/ChatFlow%20Setup%200.4.1.exe)
* ⚡ **Tải bản Portable (Chạy ngay không cần cài đặt):** [ChatFlow 0.4.1.exe](https://github.com/Asdb24/DoAnLapTrinhMang/releases/download/v0.4.1/ChatFlow%200.4.1.exe)
* 🔗 **Trang phát hành chính thức:** [GitHub Releases v0.4.1](https://github.com/Asdb24/DoAnLapTrinhMang/releases/tag/v0.4.1)

---

## 🔑 Tài Khoản Kiểm Thử Trực Tiếp (Live Test Accounts)

Hệ thống đã có sẵn tài khoản thật trên máy chủ Cloud để giáo viên hoặc người chấm đồ án kiểm thử trực tiếp:

| Người dùng | Email | Mật khẩu | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Alice** | `alice@gmail.com` | `Password123!` | Đã kích hoạt (Active) |
| **Bob** | `bob@gmail.com` | `Password123!` | Đã kích hoạt (Active) |

> 💡 *Bạn cũng có thể bấm nút **Đăng ký (Sign Up)** trực tiếp trên giao diện ứng dụng để tạo thêm tài khoản mới bất kỳ.*

---

## 🏗️ Kiến Trúc Mạng & Công Nghệ (Network Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ChatFlow Clients                                │
│   ┌───────────────────────────────┐  ┌─────────────────────────────┐   │
│   │ Next.js 16 Web Client (React) │  │ Electron Desktop App (.exe) │   │
│   └──────────────┬────────────────┘  └──────────────┬──────────────┘   │
└──────────────────┼──────────────────────────────────┼──────────────────┘
                   │                                  │
                   │ HTTPS / WSS                      │ Binary Chunk / RFC 6455
                   ▼                                  ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│        Supabase Cloud Engine         │  │ Oracle Cloud VPS Gateway     │
│  - GoTrue Authentication (JWT)       │  │ (168-138-160-93.sslip.io)    │
│  - PostgreSQL 16 + RLS Policies      │  │ - Custom RFC 6455 WebSocket  │
│  - 16 Transactional SQL RPCs         │  │ - TCP Socket Engine (node:net│
│  - Realtime Change Notifications     │  │ - Sliding Window Rate Limit  │
│  - Private Storage Bucket Engine     │  │ - Chunked Streaming File Srv │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

### 1. Phân Tầng Công Nghệ:
* **Giao diện & Client:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Radix UI (shadcn/ui), Lucide Icons.
* **Desktop Wrapper:** Electron 44, `electron-builder`, tích hợp node runtime nội bộ.
* **Cơ sở dữ liệu & Xác thực:** Supabase Auth (GoTrue), PostgreSQL với 100% chính sách Row Level Security (RLS) bảo vệ từng hàng dữ liệu, RPC transactional functions.
* **Máy chủ Gateway thời gian thực:**
  - Tự hiện thực hóa từ tầng socket TCP (`node:net`, `node:http`, `node:crypto`), tuân thủ chuẩn **RFC 6455 WebSocket Protocol**.
  - Triển khai độc lập trên máy chủ **Oracle Cloud VPS** (`wss://168-138-160-93.sslip.io`).
  - Hỗ trợ truyền nhận Frame-level, giải mã Masking Key, kiểm tra XOR byte payload, gửi nhận file dạng nhị phân theo từng chunk (Chunked File Transfer) kèm HTTP download streaming endpoint.

### 2. Tiêu Chuẩn "Zero Mock Data & Zero Seed Data":
* **Không sử dụng mock data:** Toàn bộ dữ liệu tin nhắn, phòng chat, danh bạ được lưu trữ và truy vấn trực tiếp từ cơ sở dữ liệu PostgreSQL thật.
* **Xác thực production:** Gateway xác minh token trực tiếp qua Supabase Auth, đối chiếu subject/expiry và kiểm tra quyền bằng user JWT/RLS. JWT mẫu chỉ được tạo trong test helper; production không có verifier HS256 riêng hoặc signing secret mặc định.

---

## 📡 Giao Thức Truyền Tin & Thao Tác Mạng (Protocol Details)

Để biết chi tiết về cấu trúc gói tin, giải thích từng byte nhị phân của khung WebSocket RFC 6455, quy trình bắt tay (Handshake), gửi tin nhắn, sửa tin nhắn (Edit), xóa/thu hồi tin nhắn (Delete/Revoke) và truyền file từng phần, xin vui lòng xem tài liệu kỹ thuật chuyên sâu:

👉 **[docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md)**

## 🔄 Sơ Đồ Luồng Hoạt Động Hệ Thống (Mermaid Diagrams)

### 1. Luồng Bắt Tay Kết Nối & Xác Thực (Handshake & Authentication Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (Web / Desktop App)
    participant GW as Oracle Cloud VPS Gateway
    participant Auth as Supabase Auth (GoTrue)

    Client->>GW: 1. HTTP GET / (Upgrade: websocket, Sec-WebSocket-Key)
    Note over GW: Tính Sec-WebSocket-Accept = Base64(SHA1(Key + WS_GUID))
    GW-->>Client: 2. HTTP 101 Switching Protocols (Connection: Upgrade)
    Note over Client,GW: Nâng cấp kết nối thành kênh TCP RFC 6455 hai chiều
    Client->>GW: 3. Gửi Frame TEXT HELLO { version: '2.0', userId, displayName, token }
    GW->>Auth: 4. Xác minh token, subject và expiry
    Auth-->>GW: 5. Token hợp lệ (valid: true, userId: verified_uid)
    GW-->>Client: 6. Gửi Frame TEXT WELCOME { version: '2.0', userId, sessionId, expiresAt }
```

---

### 2. Luồng Gửi & Đồng Bộ Tin Nhắn Thời Gian Thực (Authoritative Message Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Client A)
    participant CtxA as Alice ChatFlowContext
    participant DB as PostgreSQL (Supabase RPC)
    participant GW as Oracle Cloud Gateway
    participant CtxB as Bob ChatFlowContext
    actor Bob as Bob (Client B)

    Alice->>CtxA: 1. Nhập "Hello Bob" & bấm Gửi
    CtxA->>CtxA: 2. Tạo tin nhắn Optimistic UI (status: 'sending')
    CtxA->>DB: 3. rpc('send_message', { target_conversation, message_content, client_id })
    Note over DB: PostgreSQL Transaction:<br/>- Xác thực auth.uid()<br/>- Kiểm tra membership & blocked<br/>- Kiểm tra rate limit DB<br/>- Cấp phát UUID v4 chính thức<br/>- Ghi nhận clock_timestamp()
    DB-->>CtxA: 4. Trả về Row chính thức { id: 'msg-real-uuid', created_at }
    CtxA->>CtxA: 5. Cập nhật Optimistic message: status: 'sent', id: 'msg-real-uuid'
    CtxA->>GW: 6. Gửi SEND_MSG { serverMsgId, clientMsgId, roomId }
    Note over GW: Đọc DB dưới RLS, đối chiếu room/author/client ID/state<br/>Recheck membership sender và recipients
    GW-->>CtxA: 7. Gửi MSG_ACK
    GW->>CtxB: 8. MESSAGE_CHANGED { roomId, messageId, event: 'created' }
    CtxB->>DB: 9. Đọc lại message bằng user JWT/RLS
    DB-->>CtxB: 10. Row chuẩn từ database
    CtxB->>Bob: 11. Merge theo ID và hiển thị một bản
```

---

### 3. Luồng Sửa & Xóa / Thu Hồi Tin Nhắn (Edit & Delete/Revoke Message Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice
    participant CtxA as Alice ChatFlowContext
    participant DB as PostgreSQL RPC (delete_message)
    participant GW as Oracle Cloud Gateway
    participant CtxB as Bob ChatFlowContext
    actor Bob as Bob

    Alice->>CtxA: 1. Nhấn nút "Delete Message" (messageId)
    CtxA->>DB: 2. rpc('delete_message', { target_message: messageId })
    Note over DB: PostgreSQL Transaction:<br/>- Khóa row và kiểm tra membership/NULL-safe ownership<br/>- Lưu original vào audit private<br/>- Xóa content/media public, giữ tombstone và cursor
    DB-->>CtxA: 3. Trả về 200 OK
    CtxA->>GW: 4. Gửi frame DELETE_MSG { messageId, roomId }
    Note over GW: Đọc lại DB xác minh ownership/state<br/>Recheck membership khi delivery
    GW->>CtxB: 5. MESSAGE_CHANGED { roomId, messageId, event: 'deleted' }
    CtxA->>Alice: 6. Cập nhật UI: 'Message deleted', isDeleted: true
    CtxB->>DB: 7. Đọc tombstone dưới RLS
    CtxB->>Bob: 8. Merge trạng thái đã thu hồi
    Note over Bob: Row public không còn original content/media;<br/>file và reaction yêu cầu parent live.<br/>Nội dung đã tải về trước đó không thể thu hồi từ xa.
```

---

### 4. Luồng Truyền Tệp Đính Kèm Phân Đoạn (Chunked Binary Streaming Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client tải file
    participant GW as Oracle Cloud Gateway
    participant Disk as Gateway File System (/uploads)
    actor Receiver as Người nhận

    Client->>GW: 1. FILE_START { roomId, fileName, fileSize, totalChunks, mimeType, sha256 }
    GW-->>Client: 2. FILE_ACK { fileId: serverUUID, chunkIndex: -1, receivedBytes: 0 }
    loop Từng chunk 32 KiB binary, Base64 trong JSON
        Client->>GW: 3. FILE_CHUNK { fileId, chunkIndex, dataBase64 }
        Note over GW: Kiểm tra owner/session/membership/quota<br/>Ghi tuần tự vào private draft trên disk
        GW-->>Client: 4. FILE_ACK { fileId, chunkIndex, receivedBytes }
    end
    Client->>GW: 5. FILE_COMPLETE { fileId }
    Note over GW,Disk: Kiểm tra full digest và commit file/manifest bằng exclusive writes
    GW-->>Client: 6. FILE_READY { fileId, downloadUrl: '/uploads/:fileId?cap=...' }
    Receiver->>GW: 7. FILE_DOWNLOAD { fileId } qua socket đã xác thực
    GW-->>Receiver: 8. FILE_READY với capability theo user/session
    Receiver->>GW: 9. HTTP GET /uploads/:fileId?cap=...
    Note over GW: Recheck session còn hạn và membership
    GW-->>Receiver: 10. Private/no-store attachment stream
```

---

## 💻 Cài Đặt Và Chạy Local

### 1. Yêu cầu môi trường:
* Node.js >= 22.13.0
* npm >= 10.x

### 2. Cài đặt các gói phụ thuộc:
```powershell
# Cài đặt frontend & desktop dependencies
npm install

# Cài đặt Gateway dependencies
cd gateway
npm install
npm run build
cd ..
```

### 3. Cấu hình biến môi trường (`.env.local`):
Tạo file `.env.local` ở thư mục gốc:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3100
NEXT_PUBLIC_SUPABASE_URL=https://boonwujyiwqbrraqdbdy.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xv9IiylFCrxZgG3WHnk7mw_as0YB9gH
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xv9IiylFCrxZgG3WHnk7mw_as0YB9gH
NEXT_PUBLIC_GATEWAY_URL=wss://168-138-160-93.sslip.io
```

### 4. Khởi chạy ứng dụng:
* **Chạy Web (Next.js):**
  ```powershell
  npm run dev
  ```
  Truy cập: [http://localhost:3000](http://localhost:3000)

* **Chạy Desktop (Electron Dev):**
  ```powershell
  npm run electron:dev
  ```

* **Khởi chạy Gateway độc lập (nếu muốn chạy gateway local thay vì Cloud):**
  Cấu hình `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY` trong environment của gateway theo [DEPLOYMENT.md](docs/DEPLOYMENT.md). Gateway không đọc signing secret mặc định và sẽ từ chối khởi động nếu thiếu authorization provider.
  ```powershell
  npm --prefix gateway run dev
  ```

---

## 🧪 Hệ Thống Kiểm Thử Tự Động (Empirical Test Suites)

Dự án trang bị hệ thống kiểm thử tự động toàn diện, không phỏng đoán, đảm bảo chất lượng kỹ thuật cao nhất:

```powershell
# 1. Kiểm tra toàn bộ kiểu dữ liệu TypeScript (0 lỗi)
npm run typecheck

# 2. Kiểm thử RLS và Database Engine (số assertion hiện tại xem docs/VERIFICATION.md)
npm run test:db

# 3. Kiểm thử giao diện và hành vi tương tác Vitest
npm test

# 4. Build và chạy toàn bộ test gateway RFC 6455
npm --prefix gateway test

# 5. Build trước khi kiểm tra bundle bằng Secret Scanner
npm run build
npm run test:secrets

# 6. Hai frontend adapter thật qua socket local, không gọi VPS hoặc tạo tài khoản cloud
npm run test:local
```

---

## 📂 Cấu Trúc Thư Mục

```text
├── .github/workflows/       CI/CD GitHub Actions đóng gói Windows .exe tự động
├── docs/                    Tài liệu kỹ thuật từ A-Z
│   ├── TECHNICAL_DOCUMENTATION.md  Đặc tả giao thức mạng, RFC 6455, luồng tin nhắn
│   ├── API.md               Hợp đồng API và quyền RLS
│   ├── DEPLOYMENT.md        Hướng dẫn triển khai production
│   └── VERIFICATION.md      Báo cáo kiểm thử và bảo mật
├── electron/                Source code ứng dụng Electron Desktop (.exe)
├── gateway/                 Máy chủ ChatFlow Gateway RFC 6455 (node:net, node:http)
│   ├── src/                 Socket engine, WebSocket Frame Codec, Rate Limiter
│   └── test/                Bộ kiểm thử E2E Gateway & Security Guards
├── scripts/                 Các kịch bản kiểm thử mạng, database và cloud
├── src/
│   ├── app/                 Next.js App Router (Layouts, Pages, Routes)
│   ├── components/          Giao diện người dùng Chat, Channel, Settings, Media
│   ├── context/             ChatFlow Context Provider quản lý state thời gian thực
│   ├── services/            Tầng dịch vụ (messages, storage, realtime, workspace)
│   └── lib/                 Supabase client, theme tokens
└── supabase/migrations/     Lịch sử migrations SQL (Schema, RLS, Trigger, RPC)
```

---

## 📜 Giấy Phép & Bản Quyền
Đồ án thuộc môn **Lập Trình Mạng** — Được xây dựng phục vụ mục đích nghiên cứu học tập và đánh giá đồ án.
