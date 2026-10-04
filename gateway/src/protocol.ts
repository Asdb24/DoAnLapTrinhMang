export const PROTOCOL_VERSION = '1.0';

export type PacketType =
  | 'HELLO'
  | 'WELCOME'
  | 'PING'
  | 'PONG'
  | 'JOIN_ROOM'
  | 'ROOM_ACK'
  | 'LEAVE_ROOM'
  | 'SEND_MSG'
  | 'MSG_ACK'
  | 'NEW_MSG'
  | 'TYPING'
  | 'PRESENCE'
  | 'FILE_START'
  | 'FILE_CHUNK'
  | 'FILE_ACK'
  | 'FILE_COMPLETE'
  | 'ERROR';

export interface BasePacket {
  type: PacketType;
  id?: string;
  timestamp?: number;
}

export interface HelloPacket extends BasePacket {
  type: 'HELLO';
  userId: string;
  displayName: string;
  avatarUrl?: string;
  token?: string;
}

export interface WelcomePacket extends BasePacket {
  type: 'WELCOME';
  sessionId: string;
  userId: string;
  serverTime: number;
  heartbeatIntervalMs: number;
}

export interface PingPacket extends BasePacket {
  type: 'PING';
}

export interface PongPacket extends BasePacket {
  type: 'PONG';
}

export interface JoinRoomPacket extends BasePacket {
  type: 'JOIN_ROOM';
  roomId: string;
}

export interface RoomAckPacket extends BasePacket {
  type: 'ROOM_ACK';
  roomId: string;
  status: 'joined' | 'left';
}

export interface LeaveRoomPacket extends BasePacket {
  type: 'LEAVE_ROOM';
  roomId: string;
}

export interface SendMsgPacket extends BasePacket {
  type: 'SEND_MSG';
  clientMsgId: string;
  roomId: string;
  content: string;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    url: string;
  }>;
  media?: any;
}

export interface MsgAckPacket extends BasePacket {
  type: 'MSG_ACK';
  clientMsgId: string;
  serverMsgId: string;
  roomId: string;
  createdAt: string;
}

export interface NewMsgPacket extends BasePacket {
  type: 'NEW_MSG';
  msg: {
    id: string;
    clientMsgId?: string;
    roomId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    content: string;
    createdAt: string;
    attachments?: Array<{
      id: string;
      name: string;
      size: number;
      mimeType: string;
      url: string;
    }>;
    media?: any;
  };
}

export interface TypingPacket extends BasePacket {
  type: 'TYPING';
  roomId: string;
  userId: string;
  isTyping: boolean;
}

export interface PresencePacket extends BasePacket {
  type: 'PRESENCE';
  userId: string;
  status: 'online' | 'away' | 'offline';
}

export interface FileStartPacket extends BasePacket {
  type: 'FILE_START';
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  sha256?: string;
}

export interface FileChunkPacket extends BasePacket {
  type: 'FILE_CHUNK';
  fileId: string;
  chunkIndex: number;
  dataBase64: string;
}

export interface FileAckPacket extends BasePacket {
  type: 'FILE_ACK';
  fileId: string;
  chunkIndex: number;
  receivedBytes: number;
}

export interface FileCompletePacket extends BasePacket {
  type: 'FILE_COMPLETE';
  fileId: string;
  downloadUrl: string;
}

export interface ErrorPacket extends BasePacket {
  type: 'ERROR';
  code: string;
  message: string;
}

export type GatewayPacket =
  | HelloPacket
  | WelcomePacket
  | PingPacket
  | PongPacket
  | JoinRoomPacket
  | RoomAckPacket
  | LeaveRoomPacket
  | SendMsgPacket
  | MsgAckPacket
  | NewMsgPacket
  | TypingPacket
  | PresencePacket
  | FileStartPacket
  | FileChunkPacket
  | FileAckPacket
  | FileCompletePacket
  | ErrorPacket;
