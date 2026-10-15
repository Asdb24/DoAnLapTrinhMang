export const PROTOCOL_VERSION = '2.0';
export const CHUNK_BYTES = 32 * 1024;
export type ChangeEvent = 'created' | 'edited' | 'deleted';
export interface BasePacket { type: string; id?: string; timestamp?: number }
export interface HelloPacket extends BasePacket { type: 'HELLO'; version: string; token: string; userId: string; displayName: string; avatarUrl?: string }
export interface WelcomePacket extends BasePacket { type: 'WELCOME'; version: string; sessionId: string; userId: string; expiresAt: number; serverTime: number; heartbeatIntervalMs: number }
export interface JoinRoomPacket extends BasePacket { type: 'JOIN_ROOM'; roomId: string }
export interface LeaveRoomPacket extends BasePacket { type: 'LEAVE_ROOM'; roomId: string }
export interface SendMsgPacket extends BasePacket { type: 'SEND_MSG'; roomId: string; clientMsgId: string; serverMsgId: string }
export interface EditMsgPacket extends BasePacket { type: 'EDIT_MSG'; roomId: string; messageId: string }
export interface DeleteMsgPacket extends BasePacket { type: 'DELETE_MSG'; roomId: string; messageId: string }
export interface MessageChangedPacket extends BasePacket { type: 'MESSAGE_CHANGED'; roomId: string; messageId: string; event: ChangeEvent }
export interface MsgAckPacket extends BasePacket { type: 'MSG_ACK'; clientMsgId: string; serverMsgId: string; roomId: string; createdAt: string; event: ChangeEvent }
export interface TypingPacket extends BasePacket { type: 'TYPING'; roomId: string; userId: string; isTyping: boolean }
export interface PresencePacket extends BasePacket { type: 'PRESENCE'; userId: string; status: 'online' | 'away' | 'offline' }
export interface FileStartPacket extends BasePacket { type: 'FILE_START'; roomId: string; fileName: string; fileSize: number; mimeType: string; totalChunks: number; sha256: string }
export interface FileChunkPacket extends BasePacket { type: 'FILE_CHUNK'; fileId: string; chunkIndex: number; dataBase64: string }
export interface FileAckPacket extends BasePacket { type: 'FILE_ACK'; fileId: string; chunkIndex: number; receivedBytes: number }
export interface FileCompleteRequest extends BasePacket { type: 'FILE_COMPLETE'; fileId: string }
export interface FileCompletePacket extends BasePacket { type: 'FILE_READY'; fileId: string; downloadUrl: string }
export interface FileAbortPacket extends BasePacket { type: 'FILE_ABORT'; fileId: string }
export interface FileDownloadPacket extends BasePacket { type: 'FILE_DOWNLOAD'; fileId: string }
export interface ErrorPacket extends BasePacket { type: 'ERROR'; code: string; message: string }
export type ClientPacket = HelloPacket | JoinRoomPacket | LeaveRoomPacket | SendMsgPacket | EditMsgPacket | DeleteMsgPacket | TypingPacket | PresencePacket | FileStartPacket | FileChunkPacket | FileCompleteRequest | FileAbortPacket | FileDownloadPacket | (BasePacket & {type:'PING'|'PONG'});
export type GatewayPacket = ClientPacket | WelcomePacket | MessageChangedPacket | MsgAckPacket | FileAckPacket | FileCompletePacket | ErrorPacket | (BasePacket & {type:'ROOM_ACK'; roomId:string; status:'joined'|'left'});
