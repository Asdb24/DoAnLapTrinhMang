import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ChatFlowGateway, createTestJwt } from '../dist/server.js';
import {
  encodeFrame,
  parseFrames,
  Opcode,
  computeAcceptKey,
  encodePingFrame,
} from '../dist/websocket-codec.js';

const TEST_PORT = 9876;
const TEST_UPLOAD_DIR = path.join(process.cwd(), 'gateway', 'test-uploads');
const TEST_JWT_SECRET = 'chatflow-super-secret-jwt-key-2026-secure';

class TestClient {
  constructor(port) {
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.receivedPackets = [];
    this.rawFrames = [];
    this.closed = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.connect({ port: this.port, host: '127.0.0.1' }, () => {
        const clientKey = Buffer.from('test-key-' + Date.now()).toString('base64');
        this.expectedAccept = computeAcceptKey(clientKey);

        const handshake = [
          'GET / HTTP/1.1',
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${clientKey}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n');

        this.socket.write(handshake);

        const onHandshake = (data) => {
          const res = data.toString('utf8');
          if (res.includes('101 Switching Protocols') && res.includes(this.expectedAccept)) {
            this.socket.off('data', onHandshake);
            this.socket.on('data', (chunk) => this.onSocketData(chunk));
            this.socket.on('close', () => { this.closed = true; });
            resolve();
          } else {
            reject(new Error('Handshake failed: ' + res));
          }
        };

        this.socket.on('data', onHandshake);
      });
      this.socket.on('error', reject);
    });
  }

  onSocketData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { frames, remaining } = parseFrames(this.buffer);
    this.buffer = remaining;
    for (const frame of frames) {
      this.rawFrames.push(frame);
      if (frame.opcode === Opcode.TEXT) {
        try {
          this.receivedPackets.push(JSON.parse(frame.payload.toString('utf8')));
        } catch {}
      }
    }
  }

  sendMaskedPacket(packet) {
    const json = JSON.stringify(packet);
    const payload = Buffer.from(json, 'utf8');
    const maskKey = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ maskKey[i % 4];
    }

    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length]);
    } else if (payload.length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    this.socket.write(Buffer.concat([header, maskKey, masked]));
  }

  sendRawMaskedText(text) {
    const payload = Buffer.from(text, 'utf8');
    const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ maskKey[i % 4];
    }

    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length]);
    } else if (payload.length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    this.socket.write(Buffer.concat([header, maskKey, masked]));
  }

  sendPing() {
    this.socket.write(encodePingFrame('test-ping'));
  }

  async waitForPacket(type, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = this.receivedPackets.findIndex((p) => p.type === type);
      if (idx !== -1) {
        return this.receivedPackets.splice(idx, 1)[0];
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`Timeout waiting for packet type: ${type}`);
  }

  async waitForClose(timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.closed || !this.socket || this.socket.destroyed) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  }

  close() {
    try {
      this.socket?.end();
    } catch {}
  }
}

test('ChatFlow Gateway Security & End-to-End Test Suite', async (t) => {
  await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
  const gateway = new ChatFlowGateway({
    port: TEST_PORT,
    uploadDir: TEST_UPLOAD_DIR,
    heartbeatIntervalMs: 50000,
    supabaseJwtSecret: TEST_JWT_SECRET,
    authRequired: true,
    rateLimitMaxMessages: 10,
    rateLimitWindowMs: 2000,
    maxTextFrameBytes: 64 * 1024,
  });

  await gateway.start();

  await t.test('1. HTTP /health check', async () => {
    const data = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${TEST_PORT}/health`, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    assert.equal(data.status, 'online');
    assert.equal(data.service, 'ChatFlow Gateway (RFC 6455)');
  });

  await t.test('2. Security Guard: Reject unauthenticated packet before HELLO', async () => {
    const clientUnauth = new TestClient(TEST_PORT);
    await clientUnauth.connect();

    // Attempt to send SEND_MSG without handshake
    clientUnauth.sendMaskedPacket({
      type: 'SEND_MSG',
      clientMsgId: 'unauth_req',
      roomId: 'room_secret',
      content: 'Hacked message',
    });

    const err = await clientUnauth.waitForPacket('ERROR');
    assert.equal(err.code, 'UNAUTHORIZED');
    clientUnauth.close();
  });

  await t.test('3. Security Guard: Reject invalid JWT token on HELLO and close socket', async () => {
    const clientBad = new TestClient(TEST_PORT);
    await clientBad.connect();

    clientBad.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_attacker',
      displayName: 'Attacker',
      token: 'invalid.jwt.token',
    });

    const err = await clientBad.waitForPacket('ERROR');
    assert.equal(err.code, 'AUTH_FAILED');
    const closed = await clientBad.waitForClose();
    assert.ok(closed, 'Socket should be closed by gateway after auth failure');
  });

  await t.test('4. Security: Authenticate with valid HS256 JWT & prevent identity spoofing', async () => {
    const clientA = new TestClient(TEST_PORT);
    await clientA.connect();

    const realAliceJwt = createTestJwt({ sub: 'user_alice_uuid' }, TEST_JWT_SECRET);

    // Attacker tries to pretend to be 'user_admin' in packet.userId, but token is for 'user_alice_uuid'
    clientA.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_admin_spoofed',
      displayName: 'Alice Real',
      token: realAliceJwt,
    });

    const welcome = await clientA.waitForPacket('WELCOME');
    assert.equal(welcome.type, 'WELCOME');
    // Bound strictly to verified token subject, spoofed userId ignored!
    assert.equal(welcome.userId, 'user_alice_uuid');
    clientA.close();
  });

  const clientA = new TestClient(TEST_PORT);
  const clientB = new TestClient(TEST_PORT);
  const aliceJwt = createTestJwt({ sub: 'user_a' }, TEST_JWT_SECRET);
  const bobJwt = createTestJwt({ sub: 'user_b' }, TEST_JWT_SECRET);

  await t.test('5. Clients connect with valid tokens, join room and exchange messages', async () => {
    await clientA.connect();
    clientA.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_a',
      displayName: 'Alice',
      token: aliceJwt,
    });
    await clientA.waitForPacket('WELCOME');

    await clientB.connect();
    clientB.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_b',
      displayName: 'Bob',
      token: bobJwt,
    });
    await clientB.waitForPacket('WELCOME');

    const roomId = 'room_general';
    clientA.sendMaskedPacket({ type: 'JOIN_ROOM', roomId });
    await clientA.waitForPacket('ROOM_ACK');

    clientB.sendMaskedPacket({ type: 'JOIN_ROOM', roomId });
    await clientB.waitForPacket('ROOM_ACK');

    // Client A sends message
    clientA.sendMaskedPacket({
      type: 'SEND_MSG',
      clientMsgId: 'req_12345',
      roomId,
      content: 'Hello Bob! This is Alice.',
    });

    // 1st tick: Client A receives MSG_ACK
    const ack = await clientA.waitForPacket('MSG_ACK');
    assert.equal(ack.clientMsgId, 'req_12345');
    assert.equal(ack.roomId, roomId);

    // 2nd tick: Client B receives NEW_MSG broadcast
    const newMsg = await clientB.waitForPacket('NEW_MSG');
    assert.equal(newMsg.msg.clientMsgId, 'req_12345');
    assert.equal(newMsg.msg.content, 'Hello Bob! This is Alice.');
    assert.equal(newMsg.msg.senderId, 'user_a');
  });

  await t.test('6. Security Guard: Cannot send to room without joining', async () => {
    clientA.sendMaskedPacket({
      type: 'SEND_MSG',
      clientMsgId: 'req_unjoined',
      roomId: 'room_private_unjoined',
      content: 'Sneaking message into unjoined room',
    });

    const err = await clientA.waitForPacket('ERROR');
    assert.equal(err.code, 'NOT_IN_ROOM');
  });

  await t.test('7. Security Guard: Ownership verification on EDIT and DELETE message', async () => {
    const roomId = 'room_general';

    // Alice sends a new message
    clientA.sendMaskedPacket({
      type: 'SEND_MSG',
      clientMsgId: 'req_alice_msg_1',
      roomId,
      content: 'Original message by Alice',
    });
    const ack = await clientA.waitForPacket('MSG_ACK');
    const msgId = ack.serverMsgId;
    await clientB.waitForPacket('NEW_MSG');

    // ATTACK: Bob tries to EDIT Alice's message -> Must be rejected with FORBIDDEN!
    clientB.sendMaskedPacket({
      type: 'EDIT_MSG',
      roomId,
      messageId: msgId,
      newContent: 'Tampered by Bob!',
    });
    const editErr = await clientB.waitForPacket('ERROR');
    assert.equal(editErr.code, 'FORBIDDEN');

    // ATTACK: Bob tries to DELETE Alice's message -> Must be rejected with FORBIDDEN!
    clientB.sendMaskedPacket({
      type: 'DELETE_MSG',
      roomId,
      messageId: msgId,
    });
    const deleteErr = await clientB.waitForPacket('ERROR');
    assert.equal(deleteErr.code, 'FORBIDDEN');

    // LEGITIMATE: Alice (author) edits her own message -> Succeeded!
    clientA.sendMaskedPacket({
      type: 'EDIT_MSG',
      roomId,
      messageId: msgId,
      newContent: 'Edited legitimately by Alice',
    });
    const editBroadcast = await clientB.waitForPacket('MSG_EDITED');
    assert.equal(editBroadcast.messageId, msgId);
    assert.equal(editBroadcast.newContent, 'Edited legitimately by Alice');

    // LEGITIMATE: Alice deletes her own message -> Succeeded!
    clientA.sendMaskedPacket({
      type: 'DELETE_MSG',
      roomId,
      messageId: msgId,
    });
    const deleteBroadcast = await clientB.waitForPacket('MSG_DELETED');
    assert.equal(deleteBroadcast.messageId, msgId);
  });

  await t.test('8. Security Guard: Rate limiting drops flooding attempts', async () => {
    const roomId = 'room_general';
    let rateLimitEncountered = false;

    // Send 15 messages in burst (limit is 10)
    for (let i = 0; i < 15; i++) {
      clientA.sendMaskedPacket({
        type: 'SEND_MSG',
        clientMsgId: `flood_${i}`,
        roomId,
        content: `Flood ${i}`,
      });
    }

    // Expect at least one RATE_LIMITED error packet
    try {
      const err = await clientA.waitForPacket('ERROR', 1500);
      if (err.code === 'RATE_LIMITED') {
        rateLimitEncountered = true;
      }
    } catch {}

    assert.ok(rateLimitEncountered, 'Gateway should enforce rate limiting on message floods');
  });

  await t.test('9. Security Guard: Frame size limit protects against oversized payloads', async () => {
    const clientHuge = new TestClient(TEST_PORT);
    await clientHuge.connect();
    const tokenHuge = createTestJwt({ sub: 'user_huge' }, TEST_JWT_SECRET);
    clientHuge.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_huge',
      token: tokenHuge,
    });
    await clientHuge.waitForPacket('WELCOME');

    // Craft a frame payload > 64KB (e.g. 70KB)
    const bigPayload = JSON.stringify({
      type: 'SEND_MSG',
      roomId: 'room_general',
      content: 'A'.repeat(70 * 1024),
    });

    clientHuge.sendRawMaskedText(bigPayload);

    const err = await clientHuge.waitForPacket('ERROR');
    assert.equal(err.code, 'FRAME_TOO_LARGE');
    const closed = await clientHuge.waitForClose();
    assert.ok(closed, 'Oversized frame should close socket with code 1009');
  });

  await t.test('10. Chunked file upload and HTTP download verification', async () => {
    const fileContent = 'Part 1 binary payload. --- Part 2 binary payload with extra text!';
    const chunk1 = Buffer.from(fileContent.slice(0, 20)).toString('base64');
    const chunk2 = Buffer.from(fileContent.slice(20)).toString('base64');

    const fileId = 'file_test_99';
    const fileName = 'document.txt';

    // Start upload
    clientA.sendMaskedPacket({
      type: 'FILE_START',
      fileId,
      fileName,
      fileSize: fileContent.length,
      mimeType: 'text/plain',
      totalChunks: 2,
    });
    await clientA.waitForPacket('FILE_ACK');

    // Send chunk 0
    clientA.sendMaskedPacket({
      type: 'FILE_CHUNK',
      fileId,
      chunkIndex: 0,
      dataBase64: chunk1,
    });
    await clientA.waitForPacket('FILE_ACK');

    // Send chunk 1
    clientA.sendMaskedPacket({
      type: 'FILE_CHUNK',
      fileId,
      chunkIndex: 1,
      dataBase64: chunk2,
    });
    await clientA.waitForPacket('FILE_ACK');

    // Complete upload
    clientA.sendMaskedPacket({
      type: 'FILE_COMPLETE',
      fileId,
    });
    const complete = await clientA.waitForPacket('FILE_COMPLETE');
    assert.equal(complete.downloadUrl, `/uploads/${fileId}/${fileName}`);

    // Download file over HTTP to verify disk integrity
    const downloadedText = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${TEST_PORT}${complete.downloadUrl}`, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve(body));
      }).on('error', reject);
    });

    assert.equal(downloadedText, fileContent);
  });

  clientA.close();
  clientB.close();
  await gateway.stop();
  await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});
