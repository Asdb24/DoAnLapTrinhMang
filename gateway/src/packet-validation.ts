import { CHUNK_BYTES, type ClientPacket } from './protocol.js';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateClientPacket(value: unknown): ClientPacket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Packet must be an object');
  const p = value as Record<string, unknown>;
  const str = (key:string,max=256) => typeof p[key] === 'string' && (p[key] as string).length > 0 && (p[key] as string).length <= max;
  const uuid = (key:string) => str(key,36) && UUID.test(p[key] as string);
  const integer = (key:string,min:number,max:number) => Number.isSafeInteger(p[key]) && Number(p[key]) >= min && Number(p[key]) <= max;
  let fields:string[] = ['type','id','timestamp'];
  let valid = str('type',32) && (p.id === undefined || str('id',128)) && (p.timestamp === undefined || integer('timestamp',0,Number.MAX_SAFE_INTEGER));
  const add = (...names:string[]) => { fields.push(...names); };
  switch(p.type) {
    case 'HELLO': add('version','token','userId','displayName','avatarUrl'); valid &&= str('version',16) && str('token',8192) && uuid('userId') && str('displayName',100) && (p.avatarUrl === undefined || typeof p.avatarUrl === 'string' && p.avatarUrl.length <= 2048); break;
    case 'PING': case 'PONG': break;
    case 'JOIN_ROOM': case 'LEAVE_ROOM': add('roomId'); valid &&= uuid('roomId'); break;
    case 'SEND_MSG': add('roomId','clientMsgId','serverMsgId'); valid &&= uuid('roomId') && str('clientMsgId',128) && uuid('serverMsgId'); break;
    case 'EDIT_MSG': case 'DELETE_MSG': add('roomId','messageId'); valid &&= uuid('roomId') && uuid('messageId'); break;
    case 'TYPING': add('roomId','userId','isTyping'); valid &&= uuid('roomId') && uuid('userId') && typeof p.isTyping === 'boolean'; break;
    case 'PRESENCE': add('userId','status'); valid &&= uuid('userId') && ['online','away','offline'].includes(String(p.status)); break;
    case 'FILE_START': add('roomId','fileName','fileSize','mimeType','totalChunks','sha256'); valid &&= uuid('roomId') && str('fileName',255) && !/[\x00-\x1f\x7f]/.test(String(p.fileName)) && integer('fileSize',1,25*1024*1024) && str('mimeType',128) && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(p.mimeType)) && integer('totalChunks',1,800) && p.totalChunks === Math.ceil(Number(p.fileSize)/CHUNK_BYTES) && /^[a-f0-9]{64}$/i.test(String(p.sha256)); break;
    case 'FILE_CHUNK': add('fileId','chunkIndex','dataBase64'); valid &&= uuid('fileId') && integer('chunkIndex',0,799) && str('dataBase64',Math.ceil(CHUNK_BYTES/3)*4) && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(String(p.dataBase64)); if(valid) valid &&= Buffer.from(String(p.dataBase64),'base64').toString('base64') === p.dataBase64; break;
    case 'FILE_COMPLETE': case 'FILE_ABORT': case 'FILE_DOWNLOAD': add('fileId'); valid &&= uuid('fileId'); break;
    default: valid = false;
  }
  if (!valid || Object.keys(p).some(key => !fields.includes(key))) throw new Error('Invalid packet fields or direction');
  return p as unknown as ClientPacket;
}
