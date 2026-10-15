import { promises as fs, constants, type ReadStream } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { CHUNK_BYTES, type FileStartPacket } from './protocol.js';
import { UUID } from './packet-validation.js';
import type { AuthorizedSession } from './supabase-authorizer.js';

export interface FileManifest { fileId:string; storageName:string; ownerId:string; roomId:string; fileName:string; fileSize:number; mimeType:string; sha256:string; completedAt:number }
interface Draft extends FileManifest { sessionId:string; totalChunks:number; receivedBytes:number; hashes:string[]; updatedAt:number }
export interface TransferLimits { maxFileBytes?:number; maxImageBytes?:number; perUserBytes?:number; globalBytes?:number; perUserConcurrent?:number; globalConcurrent?:number; idleMs?:number; maxStoredFiles?:number }
export class FileTransfers {
  private root:string;
  private drafts = new Map<string,Draft>();
  private completed = new Map<string,FileManifest>();
  private secret:Buffer;
  private limits:Required<TransferLimits>;
  constructor(root:string,limits:TransferLimits={},secret?:string,private now=Date.now) {
    this.root=path.resolve(root);
    if(secret && secret.length<32) throw new Error('Download secret must contain at least 32 characters');
    this.secret=secret?Buffer.from(secret):randomBytes(32);
    this.limits={maxFileBytes:25*1024*1024,maxImageBytes:10*1024*1024,perUserBytes:1024*1024*1024,globalBytes:10*1024*1024*1024,perUserConcurrent:2,globalConcurrent:32,idleMs:5*60*1000,maxStoredFiles:10000,...limits};
    if(Object.values(this.limits).some(v=>!Number.isSafeInteger(v)||v<=0)) throw new Error('Invalid transfer limits');
  }
  private target(area:'drafts'|'files'|'manifests',id:string):string {
    if(!UUID.test(id)) throw new Error('Invalid storage ID');
    const result=path.resolve(this.root,area,id+(area==='manifests'?'.json':'.bin'));
    if(!result.startsWith(this.root+path.sep)) throw new Error('Storage containment failure');
    return result;
  }
  private async directory(area:string) {
    const dir=path.join(this.root,area);
    const stat=await fs.lstat(dir);
    if(stat.isSymbolicLink()||!stat.isDirectory()||path.resolve(await fs.realpath(dir))!==dir) throw new Error('Unsafe storage directory');
  }
  private async open(area:'drafts'|'files'|'manifests',id:string,flags:number) {
    await this.directory(area);
    const target=this.target(area,id);
    const stat=await fs.lstat(target).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;});
    if(stat && (stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1)) throw new Error('Unsafe storage file');
    return fs.open(target,flags | (constants.O_NOFOLLOW || 0),0o600);
  }
  private async remove(area:'drafts'|'files'|'manifests',id:string) {
    await this.directory(area);
    await fs.unlink(this.target(area,id)).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});
  }
  async initialize() {
    await fs.mkdir(this.root,{recursive:true,mode:0o700});
    if((await fs.lstat(this.root)).isSymbolicLink()) throw new Error('Unsafe storage root');
    this.root=path.resolve(await fs.realpath(this.root));
    for(const area of ['drafts','files','manifests']) {await fs.mkdir(path.join(this.root,area),{recursive:true,mode:0o700});await this.directory(area);}
    for await(const entry of await fs.opendir(path.join(this.root,'drafts'))) {
      if(/^[a-f0-9-]{36}\.bin$/i.test(entry.name)) await this.remove('drafts',entry.name.slice(0,36));
    }
    for await(const entry of await fs.opendir(path.join(this.root,'manifests'))) {
      if(!/^[a-f0-9-]{36}\.json$/i.test(entry.name)) throw new Error('Unexpected storage manifest');
      if(this.completed.size>=this.limits.maxStoredFiles) throw new Error('Stored file budget exceeded');
      const id=entry.name.slice(0,36),h=await this.open('manifests',id,constants.O_RDONLY);
      let m:FileManifest;
      try {if((await h.stat()).size>4096)throw new Error('Oversized manifest');m=JSON.parse(await h.readFile('utf8'));} finally {await h.close();}
      if(!m || m.fileId!==id || m.storageName!==id || !UUID.test(m.ownerId)||!UUID.test(m.roomId)||!Number.isSafeInteger(m.fileSize)||m.fileSize<1||m.fileSize>this.limits.maxFileBytes||!/^[a-f0-9]{64}$/i.test(m.sha256)||typeof m.fileName!=='string'||m.fileName.length>255||/[\x00-\x1f\x7f]/.test(m.fileName)||typeof m.mimeType!=='string'||m.mimeType.length>128||!Number.isSafeInteger(m.completedAt))throw new Error('Invalid persisted manifest');
      const file=await this.open('files',id,constants.O_RDONLY);
      try {if((await file.stat()).size!==m.fileSize)throw new Error('Persisted file size mismatch');}finally{await file.close();}
      this.completed.set(id,m);
      this.checkQuota(m.ownerId,0);
    }
    // A crash after exclusive final-file creation but before manifest commit leaves an orphan.
    for await(const entry of await fs.opendir(path.join(this.root,'files'))) {
      if(/^[a-f0-9-]{36}\.bin$/i.test(entry.name)&&!this.completed.has(entry.name.slice(0,36)))await this.remove('files',entry.name.slice(0,36));
    }
  }
  private checkQuota(user:string,reserve:number) {
    let total=reserve,userBytes=reserve;
    for(const m of [...this.completed.values(),...this.drafts.values()]) {total+=m.fileSize;if(m.ownerId===user)userBytes+=m.fileSize;}
    if(total>this.limits.globalBytes||userBytes>this.limits.perUserBytes)throw new Error('File quota exceeded');
  }
  async start(s:AuthorizedSession,p:FileStartPacket):Promise<Draft> {
    if(p.fileSize>this.limits.maxFileBytes || p.mimeType.startsWith('image/')&&p.fileSize>this.limits.maxImageBytes)throw new Error('File size limit exceeded');
    if(this.drafts.size>=this.limits.globalConcurrent||[...this.drafts.values()].filter(d=>d.ownerId===s.userId).length>=this.limits.perUserConcurrent||this.completed.size+this.drafts.size>=this.limits.maxStoredFiles)throw new Error('Upload concurrency limit exceeded');
    this.checkQuota(s.userId,p.fileSize);
    const id=randomUUID();
    const d:Draft={fileId:id,storageName:id,ownerId:s.userId,roomId:p.roomId,fileName:p.fileName,fileSize:p.fileSize,mimeType:p.mimeType,sha256:p.sha256.toLowerCase(),completedAt:0,sessionId:s.sessionId,totalChunks:p.totalChunks,receivedBytes:0,hashes:[],updatedAt:this.now()};
    this.drafts.set(id,d);
    try {const h=await this.open('drafts',id,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR);await h.close();return d;}catch(e){this.drafts.delete(id);throw e;}
  }
  draft(s:AuthorizedSession,id:string):Draft {
    const d=this.drafts.get(id);
    if(!d||d.ownerId!==s.userId||d.sessionId!==s.sessionId)throw new Error('Upload owner/session mismatch');
    if(this.now()-d.updatedAt>this.limits.idleMs)throw new Error('Upload expired');
    return d;
  }
  async chunk(s:AuthorizedSession,id:string,index:number,data:Buffer) {
    const d=this.draft(s,id);
    const hash=createHash('sha256').update(data).digest('hex');
    if(index<0||index>=d.totalChunks||!Number.isSafeInteger(index))throw new Error('Invalid chunk index');
    if(d.hashes[index]) {if(d.hashes[index]!==hash)throw new Error('Conflicting duplicate chunk');d.updatedAt=this.now();return d;}
    if(index!==d.hashes.length || data.length!==Math.min(CHUNK_BYTES,d.fileSize-index*CHUNK_BYTES))throw new Error('Invalid chunk size/order');
    const h=await this.open('drafts',id,constants.O_RDWR);
    try {let offset=0;while(offset<data.length){const w=await h.write(data,offset,data.length-offset,index*CHUNK_BYTES+offset);if(w.bytesWritten===0)throw new Error('Incomplete write');offset+=w.bytesWritten;}}finally{await h.close();}
    d.hashes.push(hash);d.receivedBytes+=data.length;d.updatedAt=this.now();return d;
  }
  async complete(s:AuthorizedSession,id:string):Promise<FileManifest> {
    const d=this.draft(s,id);
    if(d.hashes.length!==d.totalChunks||d.receivedBytes!==d.fileSize)throw new Error('Incomplete upload');
    const input=await this.open('drafts',id,constants.O_RDONLY);
    const hash=createHash('sha256');
    try {for await(const chunk of input.createReadStream({autoClose:false}))hash.update(chunk);}finally{await input.close();}
    if(hash.digest('hex')!==d.sha256){await this.abort(s,id);throw new Error('File digest mismatch');}
    let finalCreated=false,manifestCreated=false;
    try {
      const source=await this.open('drafts',id,constants.O_RDONLY);
      try {
        const dest=await this.open('files',id,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY);finalCreated=true;
        try {let offset=0;for await(const bytes of source.createReadStream({autoClose:false})){let written=0;while(written<bytes.length){const w=await dest.write(bytes,written,bytes.length-written,offset+written);if(!w.bytesWritten)throw new Error('Incomplete write');written+=w.bytesWritten;}offset+=bytes.length;}await dest.sync();}finally{await dest.close();}
      }finally{await source.close();}
      const m:FileManifest={fileId:id,storageName:id,ownerId:d.ownerId,roomId:d.roomId,fileName:d.fileName,fileSize:d.fileSize,mimeType:d.mimeType,sha256:d.sha256,completedAt:this.now()};
      const manifest=await this.open('manifests',id,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY);manifestCreated=true;
      try {await manifest.writeFile(JSON.stringify(m));await manifest.sync();}finally{await manifest.close();}
      await this.remove('drafts',id);this.drafts.delete(id);this.completed.set(id,m);return m;
    }catch(e){if(manifestCreated)await this.remove('manifests',id);if(finalCreated)await this.remove('files',id);await this.abort(s,id);throw e;}
  }
  async abort(s:AuthorizedSession,id:string) {const d=this.draft(s,id);await this.remove('drafts',id);this.drafts.delete(d.fileId);}
  async cleanup(sessionId?:string) {for(const d of this.drafts.values()){if(sessionId?d.sessionId===sessionId:this.now()-d.updatedAt>this.limits.idleMs){await this.remove('drafts',d.fileId);this.drafts.delete(d.fileId);}}}
  manifest(id:string):FileManifest {const m=this.completed.get(id);if(!m)throw new Error('File unavailable');return m;}
  capability(s:AuthorizedSession,id:string):string {
    const m=this.manifest(id),expiresAt=Math.min(s.expiresAt,this.now()+60000);
    const payload=Buffer.from(JSON.stringify({fileId:id,roomId:m.roomId,userId:s.userId,sessionId:s.sessionId,expiresAt})).toString('base64url');
    return payload+'.'+createHmac('sha256',this.secret).update(payload).digest('base64url');
  }
  verifyCapability(token:string) {
    if(token.length>2048)throw new Error('Invalid capability');
    const [payload,sig,...extra]=token.split('.');if(!payload||!sig||extra.length)throw new Error('Invalid capability');
    const expected=createHmac('sha256',this.secret).update(payload).digest();const actual=Buffer.from(sig,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid capability');
    const c=JSON.parse(Buffer.from(payload,'base64url').toString());
    if(!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=this.now()||!UUID.test(c.fileId)||!UUID.test(c.sessionId)||!UUID.test(c.userId)||!UUID.test(c.roomId))throw new Error('Expired capability');
    return c as {fileId:string;roomId:string;userId:string;sessionId:string;expiresAt:number};
  }
  async read(id:string):Promise<ReadStream> {const h=await this.open('files',id,constants.O_RDONLY);return h.createReadStream();}
}
