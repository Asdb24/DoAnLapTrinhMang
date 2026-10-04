import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import {
  computeAcceptKey,
  buildUpgradeResponse,
  parseFrames,
  encodeFrame,
  encodePingFrame,
  encodeCloseFrame,
  Opcode,
  type WebSocketFrame,
} from './websocket-codec.js';
import {
  PROTOCOL_VERSION,
  type GatewayPacket,
  type HelloPacket,
  type WelcomePacket,
  type SendMsgPacket,
  type MsgAckPacket,
  type NewMsgPacket,
  type JoinRoomPacket,
  type LeaveRoomPacket,
  type TypingPacket,
  type PresencePacket,
  type FileStartPacket,
  type FileChunkPacket,
  type FileAckPacket,
  type FileCompletePacket,
  type ErrorPacket,
} from './protocol.js';

export interface GatewayOptions {
  port: number;
  uploadDir: string;
  heartbeatIntervalMs?: number;
}

export class ClientConnection {
  public id: string;
  public socket: Socket;
  public userId: string | null = null;
  public displayName: string = 'Anonymous';
  public avatarUrl: string = '';
  public joinedRooms: Set<string> = new Set();
  public isAlive: boolean = true;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(socket: Socket) {
    this.id = randomUUID();
    this.socket = socket;
  }

  public appendData(data: Buffer): WebSocketFrame[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const { frames, remaining } = parseFrames(this.buffer);
    this.buffer = remaining;
    return frames;
  }

  public send(payload: string | Buffer, opcode: Opcode = Opcode.TEXT) {
    if (!this.socket.writable) return;
    const frame = encodeFrame(payload, opcode);
    this.socket.write(frame);
  }

  public sendPacket(packet: GatewayPacket) {
    this.send(JSON.stringify(packet), Opcode.TEXT);
  }

  public ping() {
    if (!this.socket.writable) return;
    this.socket.write(encodePingFrame());
  }

  public close(code = 1000, reason = 'Normal Closure') {
    if (!this.socket.writable) return;
    try {
      this.socket.write(encodeCloseFrame(code, reason));
    } catch {
      // Ignore write errors during close
    }
    this.socket.end();
  }
}

export class ChatFlowGateway {
  private server = createServer();
  private connections = new Map<string, ClientConnection>(); // connId -> ClientConnection
  private userSockets = new Map<string, Set<ClientConnection>>(); // userId -> Set<conn>
  private roomMembers = new Map<string, Set<ClientConnection>>(); // roomId -> Set<conn>
  private fileUploads = new Map<string, {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    receivedChunks: Set<number>;
    targetDir: string;
  }>();

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private options: GatewayOptions;

  constructor(options: GatewayOptions) {
    this.options = {
      heartbeatIntervalMs: 25000,
      ...options,
    };
    this.setupHttp();
    this.setupUpgrade();
  }

  private setupHttp() {
    this.server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'online',
            service: 'ChatFlow Gateway (RFC 6455)',
            version: PROTOCOL_VERSION,
            activeConnections: this.connections.size,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // File download endpoint: /uploads/:fileId/:filename
      if (url.pathname.startsWith('/uploads/') && req.method === 'GET') {
        const parts = url.pathname.slice('/uploads/'.length).split('/');
        const fileId = parts[0];
        const fileName = parts.slice(1).join('/');

        if (!fileId || !fileName || fileId.includes('..') || fileName.includes('..')) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid file path');
          return;
        }

        const filePath = path.join(this.options.uploadDir, fileId, fileName);
        if (!existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
          return;
        }

        const stat = await fs.stat(filePath);
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
          'Cache-Control': 'public, max-age=86400',
        });
        createReadStream(filePath).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  }

  private setupUpgrade() {
    this.server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
      const upgradeHeader = req.headers['upgrade'];
      const key = req.headers['sec-websocket-key'];
      const version = req.headers['sec-websocket-version'];

      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket' || !key) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      if (version !== '13') {
        socket.write('HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\n\r\n');
        socket.destroy();
        return;
      }

      const acceptKey = computeAcceptKey(key);
      const upgradeResponse = buildUpgradeResponse(acceptKey);
      socket.write(upgradeResponse);

      const client = new ClientConnection(socket);
      this.connections.set(client.id, client);

      socket.on('data', (chunk: Buffer) => {
        try {
          const frames = client.appendData(chunk);
          for (const frame of frames) {
            this.handleFrame(client, frame);
          }
        } catch (err) {
          console.error(`[Gateway] Error parsing frame from client ${client.id}:`, err);
          client.close(1002, 'Protocol Error');
        }
      });

      socket.on('close', () => {
        this.handleClientDisconnect(client);
      });

      socket.on('error', (err) => {
        console.error(`[Gateway] Socket error on ${client.id}:`, err.message);
        socket.destroy();
      });
    });
  }

  private handleFrame(client: ClientConnection, frame: WebSocketFrame) {
    if (frame.opcode === Opcode.PING) {
      client.send(frame.payload, Opcode.PONG);
      return;
    }

    if (frame.opcode === Opcode.PONG) {
      client.isAlive = true;
      return;
    }

    if (frame.opcode === Opcode.CLOSE) {
      client.close();
      return;
    }

    if (frame.opcode === Opcode.TEXT) {
      const text = frame.payload.toString('utf8');
      try {
        const packet = JSON.parse(text) as GatewayPacket;
        this.dispatchPacket(client, packet);
      } catch {
        const errorPacket: ErrorPacket = {
          type: 'ERROR',
          code: 'INVALID_JSON',
          message: 'Received malformed JSON message',
        };
        client.sendPacket(errorPacket);
      }
    }
  }

  private dispatchPacket(client: ClientConnection, packet: GatewayPacket) {
    switch (packet.type) {
      case 'HELLO':
        this.handleHello(client, packet);
        break;
      case 'PING':
        client.sendPacket({ type: 'PONG' });
        break;
      case 'JOIN_ROOM':
        this.handleJoinRoom(client, packet);
        break;
      case 'LEAVE_ROOM':
        this.handleLeaveRoom(client, packet);
        break;
      case 'SEND_MSG':
        this.handleSendMsg(client, packet);
        break;
      case 'TYPING':
        this.handleTyping(client, packet);
        break;
      case 'PRESENCE':
        this.handlePresence(client, packet);
        break;
      case 'FILE_START':
        this.handleFileStart(client, packet);
        break;
      case 'FILE_CHUNK':
        this.handleFileChunk(client, packet);
        break;
      case 'FILE_COMPLETE':
        this.handleFileComplete(client, packet);
        break;
      default:
        console.warn(`[Gateway] Unrecognized packet type: ${(packet as any).type}`);
    }
  }

  private handleHello(client: ClientConnection, packet: HelloPacket) {
    client.userId = packet.userId;
    client.displayName = packet.displayName || 'Anonymous';
    client.avatarUrl = packet.avatarUrl || '';

    if (!this.userSockets.has(packet.userId)) {
      this.userSockets.set(packet.userId, new Set());
    }
    this.userSockets.get(packet.userId)!.add(client);

    const welcome: WelcomePacket = {
      type: 'WELCOME',
      sessionId: client.id,
      userId: packet.userId,
      serverTime: Date.now(),
      heartbeatIntervalMs: this.options.heartbeatIntervalMs || 25000,
    };
    client.sendPacket(welcome);

    // Broadcast user online status
    this.broadcastPresence(packet.userId, 'online');
  }

  private handleJoinRoom(client: ClientConnection, packet: JoinRoomPacket) {
    if (!packet.roomId) return;
    client.joinedRooms.add(packet.roomId);

    if (!this.roomMembers.has(packet.roomId)) {
      this.roomMembers.set(packet.roomId, new Set());
    }
    this.roomMembers.get(packet.roomId)!.add(client);

    client.sendPacket({
      type: 'ROOM_ACK',
      roomId: packet.roomId,
      status: 'joined',
    });
  }

  private handleLeaveRoom(client: ClientConnection, packet: LeaveRoomPacket) {
    if (!packet.roomId) return;
    client.joinedRooms.delete(packet.roomId);
    this.roomMembers.get(packet.roomId)?.delete(client);

    client.sendPacket({
      type: 'ROOM_ACK',
      roomId: packet.roomId,
      status: 'left',
    });
  }

  private handleSendMsg(client: ClientConnection, packet: SendMsgPacket) {
    const serverMsgId = `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    // 1. Send immediate ACK back to sender (1st tick)
    const ack: MsgAckPacket = {
      type: 'MSG_ACK',
      clientMsgId: packet.clientMsgId,
      serverMsgId,
      roomId: packet.roomId,
      createdAt: nowIso,
    };
    client.sendPacket(ack);

    // 2. Broadcast NEW_MSG to all members in room
    const newMsg: NewMsgPacket = {
      type: 'NEW_MSG',
      msg: {
        id: serverMsgId,
        clientMsgId: packet.clientMsgId,
        roomId: packet.roomId,
        senderId: client.userId || 'anon',
        senderName: client.displayName,
        senderAvatar: client.avatarUrl,
        content: packet.content,
        createdAt: nowIso,
        attachments: packet.attachments,
        media: packet.media,
      },
    };

    const members = this.roomMembers.get(packet.roomId);
    if (members) {
      for (const member of members) {
        member.sendPacket(newMsg);
      }
    }
  }

  private handleTyping(client: ClientConnection, packet: TypingPacket) {
    const members = this.roomMembers.get(packet.roomId);
    if (!members) return;

    for (const member of members) {
      if (member.id !== client.id) {
        member.sendPacket(packet);
      }
    }
  }

  private handlePresence(client: ClientConnection, packet: PresencePacket) {
    if (client.userId) {
      this.broadcastPresence(client.userId, packet.status);
    }
  }

  private broadcastPresence(userId: string, status: 'online' | 'away' | 'offline') {
    const presence: PresencePacket = {
      type: 'PRESENCE',
      userId,
      status,
    };

    for (const client of this.connections.values()) {
      client.sendPacket(presence);
    }
  }

  // --- Chunked File Transfer Handlers ---

  private async handleFileStart(client: ClientConnection, packet: FileStartPacket) {
    const targetDir = path.join(this.options.uploadDir, packet.fileId);
    await fs.mkdir(targetDir, { recursive: true });

    this.fileUploads.set(packet.fileId, {
      fileId: packet.fileId,
      fileName: packet.fileName,
      fileSize: packet.fileSize,
      mimeType: packet.mimeType,
      totalChunks: packet.totalChunks,
      receivedChunks: new Set(),
      targetDir,
    });

    const ack: FileAckPacket = {
      type: 'FILE_ACK',
      fileId: packet.fileId,
      chunkIndex: -1,
      receivedBytes: 0,
    };
    client.sendPacket(ack);
  }

  private async handleFileChunk(client: ClientConnection, packet: FileChunkPacket) {
    const upload = this.fileUploads.get(packet.fileId);
    if (!upload) {
      client.sendPacket({ type: 'ERROR', code: 'FILE_NOT_FOUND', message: 'File upload session missing' });
      return;
    }

    const chunkPath = path.join(upload.targetDir, `part_${packet.chunkIndex.toString().padStart(6, '0')}`);
    const chunkBuffer = Buffer.from(packet.dataBase64, 'base64');
    await fs.writeFile(chunkPath, chunkBuffer);

    upload.receivedChunks.add(packet.chunkIndex);

    const ack: FileAckPacket = {
      type: 'FILE_ACK',
      fileId: packet.fileId,
      chunkIndex: packet.chunkIndex,
      receivedBytes: upload.receivedChunks.size * chunkBuffer.length,
    };
    client.sendPacket(ack);
  }

  private async handleFileComplete(client: ClientConnection, packet: FileCompletePacket) {
    const upload = this.fileUploads.get(packet.fileId);
    if (!upload) return;

    // Merge all chunk parts in order
    const finalPath = path.join(upload.targetDir, upload.fileName);
    const parts = await fs.readdir(upload.targetDir);
    const sortedParts = parts.filter((p) => p.startsWith('part_')).sort();

    const writeStream = (await fs.open(finalPath, 'w')).createWriteStream();
    for (const part of sortedParts) {
      const partPath = path.join(upload.targetDir, part);
      const data = await fs.readFile(partPath);
      writeStream.write(data);
      await fs.unlink(partPath); // clean temp chunk
    }
    await new Promise((resolve) => writeStream.end(resolve));

    const downloadUrl = `/uploads/${upload.fileId}/${encodeURIComponent(upload.fileName)}`;

    const complete: FileCompletePacket = {
      type: 'FILE_COMPLETE',
      fileId: packet.fileId,
      downloadUrl,
    };
    client.sendPacket(complete);

    this.fileUploads.delete(packet.fileId);
  }

  private handleClientDisconnect(client: ClientConnection) {
    this.connections.delete(client.id);

    // Remove from rooms
    for (const roomId of client.joinedRooms) {
      this.roomMembers.get(roomId)?.delete(client);
    }

    // Remove from user sockets
    if (client.userId) {
      const userSet = this.userSockets.get(client.userId);
      if (userSet) {
        userSet.delete(client);
        if (userSet.size === 0) {
          this.userSockets.delete(client.userId);
          this.broadcastPresence(client.userId, 'offline');
        }
      }
    }
  }

  public async start(): Promise<void> {
    await fs.mkdir(this.options.uploadDir, { recursive: true });

    return new Promise((resolve) => {
      this.server.listen(this.options.port, '0.0.0.0', () => {
        console.log(`[Gateway] ChatFlow Gateway listening on 0.0.0.0:${this.options.port}`);
        console.log(`[Gateway] Uploads storage directory: ${this.options.uploadDir}`);

        // Start heartbeat ping loop
        this.heartbeatTimer = setInterval(() => {
          for (const conn of this.connections.values()) {
            if (!conn.isAlive) {
              console.log(`[Gateway] Connection ${conn.id} missed heartbeat ping. Terminating.`);
              conn.close(1001, 'Heartbeat Timeout');
              this.handleClientDisconnect(conn);
            } else {
              conn.isAlive = false;
              conn.ping();
            }
          }
        }, this.options.heartbeatIntervalMs);

        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    for (const conn of this.connections.values()) {
      conn.close(1001, 'Server Shutting Down');
    }
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
