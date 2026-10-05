import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ChatFlowGateway } from '../dist/server.js';
import {
  encodeFrame,
  parseFrames,
  Opcode,
  computeAcceptKey,
  encodePingFrame,
} from '../dist/websocket-codec.js';

const TEST_PORT = 9876;
const TEST_UPLOAD_DIR = path.join(process.cwd(), 'gateway', 'test-uploads');

class TestClient {
  constructor(port) {
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.receivedPackets = [];
    this.rawFrames = [];
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
    } else {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
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

  close() {
    this.socket?.end();
  }
}

test('ChatFlow Gateway End-to-End Test Suite', async (t) => {
  await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
  const gateway = new ChatFlowGateway({
    port: TEST_PORT,
    uploadDir: TEST_UPLOAD_DIR,
    heartbeatIntervalMs: 50000,
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

  const clientA = new TestClient(TEST_PORT);
  const clientB = new TestClient(TEST_PORT);

  await t.test('2. WebSocket RFC 6455 Handshake & HELLO/WELCOME', async () => {
    await clientA.connect();
    clientA.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_a',
      displayName: 'Alice',
    });

    const welcome = await clientA.waitForPacket('WELCOME');
    assert.equal(welcome.type, 'WELCOME');
    assert.equal(welcome.userId, 'user_a');
  });

  await t.test('3. Client B connect, Join Room and 2-way message ACK', async () => {
    await clientB.connect();
    clientB.sendMaskedPacket({
      type: 'HELLO',
      userId: 'user_b',
      displayName: 'Bob',
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
    assert.equal(newMsg.msg.senderName, 'Alice');
  });

  await t.test('4. Chunked file upload and HTTP download verification', async () => {
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

  await t.test('5. Edit and Delete message over gateway broadcast', async () => {
    // Client A sends EDIT_MSG
    clientA.sendMaskedPacket({
      type: 'EDIT_MSG',
      roomId: 'room_general',
      messageId: 'msg_to_edit_123',
      newContent: 'Updated content from client A',
    });

    // Client B receives MSG_EDITED
    const editPacket = await clientB.waitForPacket('MSG_EDITED');
    assert.equal(editPacket.messageId, 'msg_to_edit_123');
    assert.equal(editPacket.newContent, 'Updated content from client A');

    // Client A sends DELETE_MSG
    clientA.sendMaskedPacket({
      type: 'DELETE_MSG',
      roomId: 'room_general',
      messageId: 'msg_to_edit_123',
    });

    // Client B receives MSG_DELETED
    const deletePacket = await clientB.waitForPacket('MSG_DELETED');
    assert.equal(deletePacket.messageId, 'msg_to_edit_123');
    assert.ok(deletePacket.deletedAt);
  });

  clientA.close();
  clientB.close();
  await gateway.stop();
  await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});
