import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAcceptKey,
  encodeFrame,
  parseFrames,
  Opcode,
  encodePingFrame,
  encodePongFrame,
  encodeCloseFrame,
} from '../dist/websocket-codec.js';

test('RFC 6455 Section 4.2.2 Handshake Accept Key Test Vector', () => {
  // Official test vector from RFC 6455 Section 1.3
  const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
  const expectedAccept = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
  const actualAccept = computeAcceptKey(clientKey);
  assert.equal(actualAccept, expectedAccept);
});

test('Encode & Parse small unmasked Text Frame (< 126 bytes)', () => {
  const message = 'Hello ChatFlow Gateway!';
  const encoded = encodeFrame(message, Opcode.TEXT);
  assert.equal((encoded[0] & 0x0f), Opcode.TEXT);
  assert.equal((encoded[0] & 0x80), 0x80); // FIN set

  const { frames, remaining } = parseFrames(encoded);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].opcode, Opcode.TEXT);
  assert.equal(frames[0].payload.toString('utf8'), message);
  assert.equal(remaining.length, 0);
});

test('Parse masked client frame with 4-byte XOR mask key', () => {
  const text = 'Ping from client';
  const payload = Buffer.from(text, 'utf8');
  const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);

  // Mask payload
  const maskedPayload = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    maskedPayload[i] = payload[i] ^ maskKey[i % 4];
  }

  // Construct frame: FIN=1, Opcode=0x1, MASK=1, Length=payload.length
  const header = Buffer.from([0x81, 0x80 | payload.length]);
  const clientFrame = Buffer.concat([header, maskKey, maskedPayload]);

  const { frames, remaining } = parseFrames(clientFrame);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].masked, true);
  assert.equal(frames[0].payload.toString('utf8'), text);
  assert.equal(remaining.length, 0);
});

test('Encode medium payload (126 <= len <= 65535)', () => {
  const largeText = 'A'.repeat(500);
  const encoded = encodeFrame(largeText, Opcode.TEXT);
  assert.equal(encoded[1] & 0x7f, 126); // length indicator = 126
  assert.equal(encoded.readUInt16BE(2), 500);

  const { frames } = parseFrames(encoded);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].payload.toString('utf8'), largeText);
});

test('Control frames (Ping, Pong, Close)', () => {
  const ping = encodePingFrame('heartbeat');
  const pong = encodePongFrame('heartbeat');
  const close = encodeCloseFrame(1000, 'Normal Closure');

  assert.equal(ping[0] & 0x0f, Opcode.PING);
  assert.equal(pong[0] & 0x0f, Opcode.PONG);
  assert.equal(close[0] & 0x0f, Opcode.CLOSE);

  const { frames: pingFrames } = parseFrames(ping);
  assert.equal(pingFrames[0].opcode, Opcode.PING);
  assert.equal(pingFrames[0].payload.toString('utf8'), 'heartbeat');
});
