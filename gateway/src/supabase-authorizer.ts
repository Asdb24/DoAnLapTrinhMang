import { UUID } from './packet-validation.js';
export interface Identity { userId:string; expiresAt:number }
export interface AuthorizedSession extends Identity { token:string; sessionId:string }
export interface StoredMessage { id:string; client_message_id:string; conversation_id:string; sender_id:string|null; created_at:string; edited_at:string|null; deleted_at:string|null }
export interface GatewayAuthorizer {
  authenticate(token:string): Promise<Identity>;
  isMember(session:AuthorizedSession,roomId:string):Promise<boolean>;
  message(session:AuthorizedSession,messageId:string):Promise<StoredMessage|null>;
  canObservePresence(session:AuthorizedSession,targetUser:string):Promise<boolean>;
}
/** Database requests run as the caller, with the public project key and RLS. */
export class SupabaseAuthorizer implements GatewayAuthorizer {
  constructor(private url:string,private publicKey:string,private timeoutMs=5000,private fetcher:typeof fetch=fetch) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new Error('Supabase must use HTTPS');
    if (!publicKey || publicKey.startsWith('sb_secret_')) throw new Error('Supabase public key required');
    if(publicKey.split('.').length === 3) {
      try { if(JSON.parse(Buffer.from(publicKey.split('.')[1],'base64url').toString()).role !== 'anon') throw new Error('Not public'); }
      catch { throw new Error('Supabase public key required'); }
    }
    this.url = url.replace(/\/$/,'');
  }
  private async request(token:string,route:string,body?:unknown):Promise<any> {
    const res=await this.fetcher(`${this.url}${route}`,{method:body===undefined?'GET':'POST',headers:{apikey:this.publicKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(this.timeoutMs)});
    if(!res.ok) throw new Error('Authorization provider rejected request');
    return res.json();
  }
  async authenticate(token:string):Promise<Identity> {
    const user=await this.request(token,'/auth/v1/user');
    let claims; try {claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());} catch {throw new Error('Invalid credentials');}
    if(!UUID.test(user.id) || claims.sub !== user.id || !Number.isSafeInteger(claims.exp) || claims.exp*1000<=Date.now()) throw new Error('Invalid credentials');
    return {userId:user.id,expiresAt:claims.exp*1000};
  }
  async isMember(s:AuthorizedSession,room:string):Promise<boolean> {
    const rows=await this.request(s.token,`/rest/v1/conversation_members?select=user_id&conversation_id=eq.${encodeURIComponent(room)}&user_id=eq.${encodeURIComponent(s.userId)}&limit=1`);
    return Array.isArray(rows) && rows.some(r=>r.user_id===s.userId);
  }
  async message(s:AuthorizedSession,id:string):Promise<StoredMessage|null> {
    const rows=await this.request(s.token,`/rest/v1/messages?select=id,client_message_id,conversation_id,sender_id,created_at,edited_at,deleted_at&id=eq.${encodeURIComponent(id)}&limit=1`);
    return Array.isArray(rows) && rows.length===1 ? rows[0] : null;
  }
  async canObservePresence(s:AuthorizedSession,target:string):Promise<boolean> {
    return (await this.request(s.token,'/rest/v1/rpc/can_observe_presence',{target_user:target})) === true;
  }
}
