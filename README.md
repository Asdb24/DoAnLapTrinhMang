# ChatFlow — Ứng Dụng Nhắn Tin Thời Gian Thực Phân Tán (Đồ Án Lập Trình Mạng)

[![Release v0.1.1](https://img.shields.io/badge/release-v0.1.1-blue.svg)](https://github.com/Asdb24/DoAnLapTrinhMang/releases/tag/v0.1.1)
[![Platform Windows](https://img.shields.io/badge/platform-Windows%20x64-green.svg)](https://github.com/Asdb24/DoAnLapTrinhMang/releases/tag/v0.1.1)
[![Protocol RFC 6455](https://img.shields.io/badge/protocol-RFC%206455%20WebSocket-orange.svg)](docs/TECHNICAL_DOCUMENTATION.md)
[![Database Supabase PostgreSQL](https://img.shields.io/badge/database-PostgreSQL%20RLS-336791.svg)](docs/API.md)
[![Build Status](https://img.shields.io/badge/tests-344%20passed-brightgreen.svg)](docs/VERIFICATION.md)

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

* 📦 **Tải bản cài đặt NSIS:** [ChatFlow.Setup.0.1.1.exe](https://github.com/Asdb24/DoAnLapTrinhMang/releases/download/v0.1.1/ChatFlow.Setup.0.1.1.exe)
* ⚡ **Tải bản Portable (Chạy ngay không cần cài đặt):** [ChatFlow.0.1.1.exe](https://github.com/Asdb24/DoAnLapTrinhMang/releases/download/v0.1.1/ChatFlow.0.1.1.exe)
* 🔗 **Trang phát hành chính thức:** [GitHub Releases v0.1.1](https://github.com/Asdb24/DoAnLapTrinhMang/releases/tag/v0.1.1)

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
* **Không có cửa sau giả mạo (No mock tokens):** Mọi gói tin kết nối đều được xác thực chữ ký mật mã **HS256 JWT** hoặc kiểm tra trực tiếp qua API Supabase Auth. Các gói tin mạo danh sẽ bị Gateway từ chối và đóng socket ngay lập tức (`code: 4001`).

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
    Client->>GW: 3. Gửi Frame TEXT HELLO { userId, displayName, token: HS256_JWT }
    GW->>Auth: 4. Kiểm tra chữ ký HS256 JWT hoặc xác thực token
    Auth-->>GW: 5. Token hợp lệ (valid: true, userId: verified_uid)
    GW-->>Client: 6. Gửi Frame TEXT WELCOME { sessionId, heartbeatIntervalMs: 25000 }
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
    CtxA->>GW: 6. Gửi WebSocket Frame SEND_MSG { serverMsgId: 'msg-real-uuid', roomId, content }
    Note over GW: Gateway xác thực Alice trong roomId,<br/>lưu quyền sở hữu tin nhắn
    GW-->>CtxA: 7. Gửi MSG_ACK
    GW->>CtxB: 8. Broadcast NEW_MSG { id: 'msg-real-uuid', content, senderName: 'Alice' }
    CtxB->>Bob: 9. Hiển thị tin nhắn tức thì trên màn hình Bob
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
    Note over DB: PostgreSQL Transaction:<br/>- Khóa dòng tin nhắn FOR UPDATE<br/>- Kiểm tra m.sender_id == auth.uid()<br/>- SET deleted_at = clock_timestamp()
    DB-->>CtxA: 3. Trả về 200 OK
    CtxA->>GW: 4. Gửi frame DELETE_MSG { messageId, roomId }
    Note over GW: Gateway kiểm tra quyền sở hữu<br/>Broadcast MSG_DELETED tới room
    GW->>CtxB: 5. Gửi frame MSG_DELETED { messageId }
    CtxA->>Alice: 6. Cập nhật UI: 'Message deleted', isDeleted: true
    CtxB->>Bob: 7. Cập nhật UI tức thì: 'Message deleted', isDeleted: true
    Note over Bob: Khi Bob F5 tải lại trang, hàm hydrate()<br/>thấy deleted_at != null sẽ tự che nội dung thành<br/>"Message deleted" (Zero Leakage)
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

    Client->>GW: 1. FILE_START { fileId, fileName, fileSize, totalChunks }
    GW-->>Client: 2. FILE_ACK { fileId, status: 'ready' }
    loop Từng chunk 64 KB
        Client->>GW: 3. FILE_CHUNK { fileId, chunkIndex, dataBase64 }
        Note over GW: Ghi chunk vào bộ nhớ đệm
        GW-->>Client: 4. FILE_ACK { fileId, chunkIndex, status: 'received' }
    end
    Client->>GW: 5. FILE_COMPLETE { fileId }
    Note over GW,Disk: Ghép nối toàn bộ chunks thành file hoàn chỉnh vào ổ đĩa
    GW-->>Client: 6. FILE_COMPLETE_ACK { fileId, downloadUrl: '/uploads/:fileId/:fileName' }
    Receiver->>GW: 7. HTTP GET /uploads/:fileId/:fileName
    GW-->>Receiver: 8. HTTP Stream 200 OK (Stream nhị phân về Client)
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
  ```powershell
  npm --prefix gateway run dev
  ```

---

## 🧪 Hệ Thống Kiểm Thử Tự Động (Empirical Test Suites)

Dự án trang bị hệ thống kiểm thử tự động toàn diện, không phỏng đoán, đảm bảo chất lượng kỹ thuật cao nhất:

```powershell
# 1. Kiểm tra toàn bộ kiểu dữ liệu TypeScript (0 lỗi)
npm run typecheck

# 2. Kiểm thử bảo mật RLS và Database Engine (232 assertions PGlite)
npm run test:db

# 3. Kiểm thử giao diện và hành vi tương tác Vitest (101 unit tests)
npm test

# 4. Kiểm thử bảo mật và giao thức mạng Gateway RFC 6455 (11 tests)
node gateway/test/gateway-e2e.test.mjs

# 5. Kiểm thử rò rỉ khóa bí mật trong gói bundle (Secret Scanner)
npm run test:secrets

# 6. Kiểm thử kết nối thời gian thực 2 chiều giữa 2 user trên VPS Oracle Cloud
node scripts/test-live-gateway-chat.mjs
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
└── supabase/migrations/     10 file migrations SQL (Schema, RLS, Trigger, RPC)
```

---

## 📜 Giấy Phép & Bản Quyền
Đồ án thuộc môn **Lập Trình Mạng** — Được xây dựng phục vụ mục đích nghiên cứu học tập và đánh giá đồ án.
