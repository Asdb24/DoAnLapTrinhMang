import { createHash } from 'node:crypto';

/**
 * RFC 6455 WebSocket Framing & Handshake Codec
 * Written from scratch using native Node.js buffers and crypto.
 */

export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export enum Opcode {
  CONTINUATION = 0x0,
  TEXT = 0x1,
  BINARY = 0x2,
  CLOSE = 0x8,
  PING = 0x9,
  PONG = 0xa,
}

export interface WebSocketFrame {
  fin: boolean;
  opcode: Opcode;
  masked: boolean;
  payload: Buffer;
}

/**
 * Computes Sec-WebSocket-Accept header value per RFC 6455 Section 4.2.2:
 * base64(sha1(Sec-WebSocket-Key + WS_GUID))
 */
export function computeAcceptKey(clientKey: string): string {
  return createHash('sha1')
    .update(clientKey.trim() + WS_GUID)
    .digest('base64');
}

/**
 * Builds the HTTP 101 Switching Protocols response header
 */
export function buildUpgradeResponse(acceptKey: string, protocol?: string): string {
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
  ];
  if (protocol) {
    headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
  }
  return headers.join('\r\n') + '\r\n\r\n';
}

/**
 * Parses raw socket bytes into WebSocket frames.
 * Returns parsed frames and any incomplete buffer remainder.
 */
export function parseFrames(buffer: Buffer): { frames: WebSocketFrame[]; remaining: Buffer } {
  const frames: WebSocketFrame[] = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];

    const fin = (firstByte & 0x80) !== 0;
    const opcode = (firstByte & 0x0f) as Opcode;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;

    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break; // Need 2 more bytes for length
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen += 2;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break; // Need 8 more bytes for length
      const bigLen = buffer.readBigUInt64BE(offset + 2);
      if (bigLen > BigInt(10 * 1024 * 1024)) {
        throw new Error('Frame payload exceeds maximum safe length (10MB)');
      }
      payloadLen = Number(bigLen);
      headerLen += 8;
    }

    let maskKey: Buffer | null = null;
    if (masked) {
      if (offset + headerLen + 4 > buffer.length) break; // Need 4 bytes for mask key
      maskKey = buffer.subarray(offset + headerLen, offset + headerLen + 4);
      headerLen += 4;
    }

    if (offset + headerLen + payloadLen > buffer.length) {
      // Incomplete frame, wait for more data from socket
      break;
    }

    const rawPayload = buffer.subarray(offset + headerLen, offset + headerLen + payloadLen);
    const unmaskedPayload = Buffer.allocUnsafe(payloadLen);

    if (masked && maskKey) {
      // RFC 6455 5.3: j = i MOD 4, transformed-octet-i = original-octet-i XOR masking-key-octet-j
      for (let i = 0; i < payloadLen; i++) {
        unmaskedPayload[i] = rawPayload[i] ^ maskKey[i % 4];
      }
    } else {
      rawPayload.copy(unmaskedPayload);
    }

    frames.push({
      fin,
      opcode,
      masked,
      payload: unmaskedPayload,
    });

    offset += headerLen + payloadLen;
  }

  return {
    frames,
    remaining: buffer.subarray(offset),
  };
}

/**
 * Encodes payload into an RFC 6455 WebSocket frame buffer.
 * Server-to-client frames MUST NOT be masked per RFC 6455 section 5.1.
 */
export function encodeFrame(
  payload: string | Buffer,
  opcode: Opcode = Opcode.TEXT,
  fin: boolean = true
): Buffer {
  const payloadBuf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const payloadLen = payloadBuf.length;

  let headerLen = 2;
  if (payloadLen >= 126 && payloadLen <= 65535) {
    headerLen += 2;
  } else if (payloadLen > 65535) {
    headerLen += 8;
  }

  const frame = Buffer.allocUnsafe(headerLen + payloadLen);

  // Byte 0: FIN (bit 7) + Opcode (bits 0-3)
  frame[0] = (fin ? 0x80 : 0x00) | (opcode & 0x0f);

  // Byte 1: Mask (bit 7 = 0 for server) + Payload len
  if (payloadLen < 126) {
    frame[1] = payloadLen;
  } else if (payloadLen <= 65535) {
    frame[1] = 126;
    frame.writeUInt16BE(payloadLen, 2);
  } else {
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(payloadLen), 2);
  }

  // Copy payload directly after header
  payloadBuf.copy(frame, headerLen);

  return frame;
}

/**
 * Builds a WebSocket Close frame (Opcode 0x8) with optional status code and reason
 */
export function encodeCloseFrame(code: number = 1000, reason: string = ''): Buffer {
  const reasonBuf = Buffer.from(reason, 'utf8');
  const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
  payload.writeUInt16BE(code, 0);
  reasonBuf.copy(payload, 2);
  return encodeFrame(payload, Opcode.CLOSE);
}

/**
 * Builds a WebSocket Ping frame (Opcode 0x9)
 */
export function encodePingFrame(data: string = ''): Buffer {
  return encodeFrame(data, Opcode.PING);
}

/**
 * Builds a WebSocket Pong frame (Opcode 0xA)
 */
export function encodePongFrame(data: string = ''): Buffer {
  return encodeFrame(data, Opcode.PONG);
}
