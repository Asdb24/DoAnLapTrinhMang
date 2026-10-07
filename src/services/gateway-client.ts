import type {
  GatewayPacket,
  HelloPacket,
  JoinRoomPacket,
  LeaveRoomPacket,
  SendMsgPacket,
  MsgAckPacket,
  NewMsgPacket,
  EditMsgPacket,
  MsgEditedPacket,
  DeleteMsgPacket,
  MsgDeletedPacket,
  TypingPacket,
  PresencePacket,
  FileStartPacket,
  FileChunkPacket,
  FileCompletePacket,
  ErrorPacket,
} from '../../gateway/src/protocol';

export type GatewayConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export interface GatewayUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  token?: string;
}

export type MessageHandler = (msg: NewMsgPacket['msg']) => void;
export type MsgAckHandler = (ack: MsgAckPacket) => void;
export type MsgEditedHandler = (packet: MsgEditedPacket) => void;
export type MsgDeletedHandler = (packet: MsgDeletedPacket) => void;
export type TypingHandler = (typing: TypingPacket) => void;
export type PresenceHandler = (presence: PresencePacket) => void;
export type StatusHandler = (status: GatewayConnectionStatus) => void;
export type ErrorHandler = (error: ErrorPacket) => void;

const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk

class GatewayClient {
  private ws: WebSocket | null = null;
  private user: GatewayUser | null = null;
  private currentRoomId: string | null = null;
  private status: GatewayConnectionStatus = 'DISCONNECTED';
  private reconnectTimer: any = null;
  private shouldReconnect = false;

  private messageHandlers: Set<MessageHandler> = new Set();
  private ackHandlers: Set<MsgAckHandler> = new Set();
  private editHandlers: Set<MsgEditedHandler> = new Set();
  private deleteHandlers: Set<MsgDeletedHandler> = new Set();
  private typingHandlers: Set<TypingHandler> = new Set();
  private presenceHandlers: Set<PresenceHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  private getGatewayUrl(): string {
    return process.env.NEXT_PUBLIC_GATEWAY_URL || 'wss://168-138-160-93.sslip.io';
  }

  public connect(user: GatewayUser, token?: string) {
    this.user = {
      ...user,
      token: token || user.token,
    };
    this.shouldReconnect = true;
    this.initSocket();
  }

  public updateToken(token: string) {
    if (this.user) {
      this.user.token = token;
    }
  }

  private initSocket() {
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
      this.setStatus('CONNECTED');
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('CONNECTING');
    const url = this.getGatewayUrl();

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.warn('[GatewayClient] Failed to create WebSocket connection:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('CONNECTED');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Handshake HELLO
      if (this.user) {
        const hello: HelloPacket = {
          type: 'HELLO',
          userId: this.user.id,
          displayName: this.user.displayName,
          avatarUrl: this.user.avatarUrl,
          token: this.user.token,
        };
        this.sendPacket(hello);
      }

      // Re-join active room if present
      if (this.currentRoomId) {
        this.sendPacket({
          type: 'JOIN_ROOM',
          roomId: this.currentRoomId,
        });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data) as GatewayPacket;
        this.handleIncomingPacket(packet);
      } catch (err) {
        console.error('[GatewayClient] Error parsing incoming packet:', err);
      }
    };

    this.ws.onclose = () => {
      this.setStatus('DISCONNECTED');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[GatewayClient] WebSocket encountered error:', err);
    };
  }

  private handleIncomingPacket(packet: GatewayPacket) {
    switch (packet.type) {
      case 'WELCOME':
        break;

      case 'PONG':
        break;

      case 'PING':
        this.sendPacket({ type: 'PONG' });
        break;

      case 'MSG_ACK':
        for (const handler of this.ackHandlers) handler(packet);
        break;

      case 'NEW_MSG':
        for (const handler of this.messageHandlers) handler(packet.msg);
        break;

      case 'MSG_EDITED':
        for (const handler of this.editHandlers) handler(packet);
        break;

      case 'MSG_DELETED':
        for (const handler of this.deleteHandlers) handler(packet);
        break;

      case 'TYPING':
        for (const handler of this.typingHandlers) handler(packet);
        break;

      case 'PRESENCE':
        for (const handler of this.presenceHandlers) handler(packet);
        break;

      case 'ERROR':
        for (const handler of this.errorHandlers) handler(packet as ErrorPacket);
        break;

      default:
        break;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.initSocket();
      }
    }, 3000);
  }

  private setStatus(status: GatewayConnectionStatus) {
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  public getStatus(): GatewayConnectionStatus {
    return this.status;
  }

  public sendPacket(packet: GatewayPacket) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  public joinRoom(roomId: string) {
    this.currentRoomId = roomId;
    const packet: JoinRoomPacket = {
      type: 'JOIN_ROOM',
      roomId,
    };
    this.sendPacket(packet);
  }

  public leaveRoom(roomId: string) {
    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
    }
    const packet: LeaveRoomPacket = {
      type: 'LEAVE_ROOM',
      roomId,
    };
    this.sendPacket(packet);
  }

  public sendChatMessage(
    roomId: string,
    content: string,
    clientMsgId: string,
    attachments?: Array<{ id: string; name: string; size: number; mimeType: string; url: string }>,
    media?: any,
    serverMsgId?: string,
    createdAt?: string
  ) {
    const packet: SendMsgPacket = {
      type: 'SEND_MSG',
      clientMsgId,
      roomId,
      content,
      attachments,
      media,
      serverMsgId,
      createdAt,
    };
    this.sendPacket(packet);
  }

  public editMessage(roomId: string, messageId: string, newContent: string) {
    const packet: EditMsgPacket = {
      type: 'EDIT_MSG',
      roomId,
      messageId,
      newContent,
      senderId: this.user?.id,
    };
    this.sendPacket(packet);
  }

  public deleteMessage(roomId: string, messageId: string) {
    const packet: DeleteMsgPacket = {
      type: 'DELETE_MSG',
      roomId,
      messageId,
      senderId: this.user?.id,
    };
    this.sendPacket(packet);
  }

  public sendTyping(roomId: string, isTyping: boolean) {
    if (!this.user) return;
    const packet: TypingPacket = {
      type: 'TYPING',
      roomId,
      userId: this.user.id,
      isTyping,
    };
    this.sendPacket(packet);
  }

  public setPresence(status: 'online' | 'away' | 'offline') {
    if (!this.user) return;
    const packet: PresencePacket = {
      type: 'PRESENCE',
      userId: this.user.id,
      status,
    };
    this.sendPacket(packet);
  }

  // --- Chunked Upload over Gateway ---
  public async uploadFileChunked(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ fileId: string; downloadUrl: string }> {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Wait until socket is open
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket Gateway is not connected.');
    }

    // 1. FILE_START
    const startPacket: FileStartPacket = {
      type: 'FILE_START',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
    };
    this.sendPacket(startPacket);

    // 2. Stream Chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const slice = file.slice(start, end);
      const arrayBuffer = await slice.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      const chunkPacket: FileChunkPacket = {
        type: 'FILE_CHUNK',
        fileId,
        chunkIndex: i,
        dataBase64: base64,
      };
      this.sendPacket(chunkPacket);

      if (onProgress) {
        const percent = Math.round(((i + 1) / totalChunks) * 100);
        onProgress(percent);
      }
    }

    // 3. Complete and await response
    return new Promise<{ fileId: string; downloadUrl: string }>((resolve, reject) => {
      const onMsg = (event: MessageEvent) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'FILE_COMPLETE' && packet.fileId === fileId) {
            this.ws?.removeEventListener('message', onMsg);
            const httpOrigin = this.getGatewayUrl().replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
            resolve({
              fileId,
              downloadUrl: `${httpOrigin}${packet.downloadUrl}`,
            });
          }
        } catch {}
      };

      this.ws?.addEventListener('message', onMsg);

      const completePacket: FileCompletePacket = {
        type: 'FILE_COMPLETE',
        fileId,
        downloadUrl: '',
      };
      this.sendPacket(completePacket);

      setTimeout(() => {
        this.ws?.removeEventListener('message', onMsg);
        reject(new Error('File upload timeout waiting for completion ACK'));
      }, 30000);
    });
  }

  // --- Subscriptions ---
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onMsgAck(handler: MsgAckHandler): () => void {
    this.ackHandlers.add(handler);
    return () => this.ackHandlers.delete(handler);
  }

  public onMsgEdited(handler: MsgEditedHandler): () => void {
    this.editHandlers.add(handler);
    return () => this.editHandlers.delete(handler);
  }

  public onMsgDeleted(handler: MsgDeletedHandler): () => void {
    this.deleteHandlers.add(handler);
    return () => this.deleteHandlers.delete(handler);
  }

  public onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.add(handler);
    return () => this.typingHandlers.delete(handler);
  }

  public onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  public onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  public onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  public disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }
}

export const gatewayClient = new GatewayClient();
