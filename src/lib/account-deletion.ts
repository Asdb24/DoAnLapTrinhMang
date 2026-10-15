import type { SupabaseClient } from '@supabase/supabase-js';

type Identity = { id: string };
export type CookieIdentity = Identity & { accessToken?: string; signOut: () => Promise<void> };
export type AccountDeletionDependencies = {
  env: Record<string, string | undefined>;
  canonicalOrigin: () => string;
  cookieIdentity: (needToken: boolean) => Promise<CookieIdentity | null>;
  verifyBearer: (token: string) => Promise<Identity | null>;
  deleteIdentity: (userId: string) => Promise<void>;
  fetch: typeof fetch;
  timeoutMs?: number;
  hostedAvailable?: boolean;
  discardAttachment?: (attachmentId: string, userId: string, bearerToken?: string) => Promise<void>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });

export function desktopRequestOrigin(request: Request, env: AccountDeletionDependencies['env']): string | null {
  const trusted = env.CHATFLOW_DESKTOP_ORIGIN;
  if (env.CHATFLOW_RUNTIME !== 'electron' || !trusted || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(trusted)) return null;
  const listener = new URL(trusted), incoming = new URL(request.url);
  if (!listener.port || Number(listener.port) > 65535) return null;
  const host = request.headers.get('host');
  // NextURL normalizes 127.0.0.1 to localhost. Accept that representation
  // only when the original Host identifies our exact loopback listener.
  const matches = incoming.origin === trusted || incoming.protocol === listener.protocol && incoming.hostname === 'localhost' && incoming.port === listener.port && host === listener.host;
  return matches && (host === null || host === listener.host) ? trusted : null;
}

export function desktopAccountEndpoint(env: AccountDeletionDependencies['env']) {
  if (!env.CHATFLOW_ACCOUNT_API_URL || !env.CHATFLOW_ACCOUNT_API_ALLOWED_ORIGINS) return null;
  try {
    const target = new URL(env.CHATFLOW_ACCOUNT_API_URL);
    const origins = env.CHATFLOW_ACCOUNT_API_ALLOWED_ORIGINS.split(',').map(value => {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid allowlist');
      return url.origin;
    });
    const hostname = target.hostname;
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/api/account' || !origins.includes(target.origin)) return null;
    if (!hostname.includes('.') || /^(?:\d+\.){3}\d+$/.test(hostname) || hostname.includes(':') || /(?:^|\.)(?:localhost|local|internal)$/.test(hostname)) return null;
    return target.href;
  } catch { return null; }
}

/** Only the server-verified subject can be deleted. Request body IDs are ignored. */
async function handleSensitiveMutation(request: Request, deps: AccountDeletionDependencies, attachmentId?: string): Promise<Response> {
  const action = attachmentId ? 'File cleanup' : 'Account deletion';
  const unavailable = () => reply(`${action} is not configured. Contact your workspace administrator.`, 503);
  const failed = (status = 503) => reply(`${action} could not finish. Please retry.`, status);
  const execute = (userId: string, token?: string) => attachmentId
    ? deps.discardAttachment ? deps.discardAttachment(attachmentId, userId, token) : Promise.reject(new Error('File cleanup unavailable'))
    : deps.deleteIdentity(userId);
  try {
    const desktop = deps.env.CHATFLOW_RUNTIME === 'electron';
    const authorization = request.headers.get('authorization');
    let identity: Identity | null;
    let cookie: CookieIdentity | null = null;
    if (desktop) {
      const trusted = deps.env.CHATFLOW_DESKTOP_ORIGIN;
      if (!trusted || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(trusted) || new URL(trusted).port === '' || Number(new URL(trusted).port) > 65535) return unavailable();
      if (!desktopRequestOrigin(request, deps.env) || request.headers.get('origin') !== trusted) return reply('Invalid request origin.', 403);
      if (authorization !== null) return reply('Use the signed-in desktop session.', 401);
      cookie = await deps.cookieIdentity(true);
      if (!cookie || !cookie.accessToken || !uuid.test(cookie.id)) return reply('Sign in to continue.', 401);
      // A cookie session's cached access token is not an identity proof.
      identity = await deps.verifyBearer(cookie.accessToken);
      if (!identity || identity.id !== cookie.id) return reply('Sign in to continue.', 401);
      const target = desktopAccountEndpoint(deps.env);
      if (!target) return unavailable();
      const endpoint = attachmentId ? new URL(`/api/attachments/${attachmentId}/discard`, target).href : target;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15000);
      try {
        const remote = await deps.fetch(endpoint, {
          method: attachmentId ? 'POST' : 'DELETE', headers: { Authorization: `Bearer ${cookie.accessToken}` },
          cache: 'no-store', redirect: 'error', signal: controller.signal,
        });
        if (!remote.ok) return failed([401, 403].includes(remote.status) ? remote.status : 503);
        const result: unknown = await remote.json();
        if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) return failed();
      } finally { clearTimeout(timer); }
    } else if (authorization !== null) {
      const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
      if (!match) return reply('Sign in to continue.', 401);
      identity = await deps.verifyBearer(match[1]);
      if (!identity || !uuid.test(identity.id)) return reply('Sign in to continue.', 401);
      if (deps.hostedAvailable === false) return unavailable();
      await execute(identity.id, match[1]);
    } else {
      if (request.headers.get('origin') !== deps.canonicalOrigin()) return reply('Invalid request origin.', 403);
      cookie = await deps.cookieIdentity(false);
      if (!cookie || !uuid.test(cookie.id)) return reply('Sign in to continue.', 401);
      if (deps.hostedAvailable === false) return unavailable();
      await execute(cookie.id);
    }
    if (cookie && !attachmentId) await cookie.signOut();
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return failed(); }
}

export const handleAccountDeletion = (request: Request, deps: AccountDeletionDependencies) => handleSensitiveMutation(request, deps);
export const handleAttachmentDiscard = (request: Request, attachmentId: string, deps: AccountDeletionDependencies) => {
  if (!uuid.test(attachmentId)) return Promise.resolve(reply('File unavailable.', 404));
  return handleSensitiveMutation(request, deps, attachmentId);
};

/** RLS/locks authorize the claim; the admin client only removes that exact path. */
export async function discardClaimedAttachment(userClient: SupabaseClient, admin: SupabaseClient, attachmentId: string, userId: string) {
  const claim = await userClient.rpc('claim_attachment_discard', { target_attachment: attachmentId });
  if (claim.error) throw claim.error;
  if (!claim.data) return;
  const row = claim.data as { id?: string; conversation_id?: string; uploader_id?: string; message_id?: string | null; storage_path?: string };
  if (row.id !== attachmentId || row.uploader_id !== userId || row.message_id !== null || !row.conversation_id || !uuid.test(row.conversation_id) || row.storage_path !== `${row.conversation_id}/${userId}/${attachmentId}`) throw new Error('Invalid cleanup claim');
  const removal = await admin.storage.from('chat-attachments').remove([row.storage_path]);
  if (removal.error) throw removal.error;
  const finalized = await userClient.rpc('discard_attachment', { target_attachment: attachmentId });
  if (finalized.error) throw finalized.error;
}

/** Cleanup failures stop before identity deletion so the caller can retry. */
export async function deleteAccountStorageAndIdentity(admin: SupabaseClient, userId: string) {
  // Byte deletion leaves metadata in place until Auth cascades. Page those
  // stable rows explicitly rather than silently stopping at PostgREST's cap.
  for (let offset = 0; ; offset += 1000) {
    const attachments = await admin.from('attachments').select('storage_path').eq('uploader_id', userId).order('id').range(offset, offset + 999);
    if (attachments.error) throw attachments.error;
    const paths = (attachments.data || []).map(row => row.storage_path as string);
    for (let index = 0; index < paths.length; index += 100) {
      const result = await admin.storage.from('chat-attachments').remove(paths.slice(index, index + 100));
      if (result.error) throw result.error;
    }
    if (paths.length < 1000) break;
  }
  // Removing each batch means the next listing must always start at offset zero.
  for (;;) {
    const result = await admin.storage.from('profile-avatars').list(userId, { limit: 100 });
    if (result.error) throw result.error;
    if (!result.data.length) break;
    const removal = await admin.storage.from('profile-avatars').remove(result.data.map(file => `${userId}/${file.name}`));
    if (removal.error) throw removal.error;
  }
  const result = await admin.auth.admin.deleteUser(userId);
  if (result.error) throw result.error;
}
