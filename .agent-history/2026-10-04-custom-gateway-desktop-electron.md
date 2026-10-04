# Technical Changelog — Custom Gateway & Windows Desktop Packaging (.exe)

**Date:** 2026-10-04  
**Author:** Pair programming (Antigravity + User)  
**Branch:** `feat/gateway-desktop-client`  

## 1. Problem Statement
The original ChatFlow project relied heavily on Supabase managed services (Realtime/WebSockets, Storage) with no custom networking code, which did not meet the core academic defense criteria for a "Computer Networking" (Lập trình mạng) course. Furthermore, the application was purely web-based with no desktop packaging (`.exe`) and could not be distributed as a standalone Windows binary.

## 2. Architecture Changes

### A. ChatFlow Gateway Server (`gateway/`)
- **Transport & Codec:** Implemented native RFC 6455 WebSocket framing and HTTP 101 upgrade handshake from scratch using Node.js `http`, `crypto`, and `net`.
  - Computes `Sec-WebSocket-Accept = base64(sha1(key + WS_GUID))`.
  - Masks and unmasks frames using 4-byte XOR bitwise operations per RFC 6455 Section 5.3.
  - Implements full opcode handling (Text, Binary, Ping, Pong, Close).
- **Application Protocol (`gateway/src/protocol.ts`):**
  - Reliable 2-way ACK: `SEND_MSG` -> `MSG_ACK` to sender (1st tick) -> `NEW_MSG` broadcast to room members (2nd tick).
  - Periodic Heartbeat: 25-second ping/pong cycle with automatic dead connection pruning and offline presence broadcasts.
  - Chunked File Streaming: 64KB chunk slices uploaded via WebSocket, assembled sequentially on disk, served over HTTP range/stream at `/uploads/:fileId/:filename`.
- **Unit Tests:** 10/10 automated tests passing for RFC 6455 test vectors, framing, ACKs, and file streaming.

### B. Cloud VPS Deployment (Oracle Cloud Always Free)
- Provisioned Ubuntu VM on Oracle Cloud (`168.138.160.93`).
- Configured VCN Ingress Rules (ports 80, 443, 8080) and Ubuntu `iptables`.
- Installed **Caddy Reverse Proxy** with automated Let's Encrypt TLS/SSL certificates for `168-138-160-93.sslip.io`.
- Gateway daemonized 24/7 with PM2.
- Verified live worldwide: `wss://168-138-160-93.sslip.io`.

### C. Client Integration (`src/services/gateway-client.ts`)
- Client connector connected to `wss://168-138-160-93.sslip.io`.
- Seamlessly hooked into `ChatFlowContext.tsx` for real-time room joining, zero-latency message broadcasts, typing indicators, and presence updates.
- 100/100 frontend unit tests passing without regression.

### D. Desktop Application (.exe) & GitHub Actions CI/CD
- Added Electron entry points (`electron/main.cjs`, `electron/preload.cjs`).
- Configured `electron-builder.json` targeting Windows NSIS Installer and Portable `.exe`.
- Created GitHub Actions CI/CD pipeline (`.github/workflows/build-exe.yml`) to automatically compile `.exe` binaries on tag pushes and manual trigger.

## 3. Security & Cleanliness Audit
- Reinforced `.gitignore` to block all `*.key`, `*.pem`, `*.cert`, `dist-electron/`, `release/`, and uploaded media.
- Verified no private keys or secrets are staged in git.
