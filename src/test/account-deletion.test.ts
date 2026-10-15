import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteAccountStorageAndIdentity, discardClaimedAttachment, desktopAccountEndpoint, handleAccountDeletion, handleAttachmentDiscard, type AccountDeletionDependencies } from '@/lib/account-deletion';

const routeMocks = vi.hoisted(() => ({ serverClient: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ serverClient: routeMocks.serverClient }));
vi.mock('@/lib/supabase/config', () => ({ requireSupabaseConfig: () => ({ url: 'https://project.example.test', key: 'public-fixture-key' }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: routeMocks.createClient }));

const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const cloud = 'https://account.example.test';
const local = 'http://127.0.0.1:3100';
function setup(desktop = false) {
  const signOut = vi.fn(async () => {});
  const deps: AccountDeletionDependencies = {
    env: desktop ? { CHATFLOW_RUNTIME: 'electron', CHATFLOW_DESKTOP_ORIGIN: local, CHATFLOW_ACCOUNT_API_URL: `${cloud}/api/account`, CHATFLOW_ACCOUNT_API_ALLOWED_ORIGINS: cloud } : {},
    canonicalOrigin: () => cloud,
    cookieIdentity: vi.fn(async () => ({ id: alice, accessToken: 'alice-user-token', signOut })),
    verifyBearer: vi.fn(async (token: string) => token === 'alice-user-token' ? { id: alice } : null),
    deleteIdentity: vi.fn(async () => {}),
    fetch: vi.fn<typeof fetch>(async () => Response.json({ ok: true })),
  };
  return { deps, signOut };
}
const request = (origin: string, headers: Record<string, string> = {}, body?: string) => new Request(`${origin}/api/account`, { method: 'DELETE', headers: { Origin: origin, ...headers }, body });

describe('self-account deletion authority', () => {
  it('allows the confirmed cookie subject at the canonical web origin', async () => {
    const { deps, signOut } = setup();
    const response = await handleAccountDeletion(request(cloud, {}, JSON.stringify({ userId: bob })), deps);
    expect(response.status).toBe(200);
    expect(deps.deleteIdentity).toHaveBeenCalledWith(alice);
    expect(deps.cookieIdentity).toHaveBeenCalledWith(false);
    expect(signOut).toHaveBeenCalledOnce();
  });
  it.each(['https://foreign.example.test', 'null', ''])('rejects foreign or missing cookie origin %s before auth', async origin => {
    const { deps } = setup();
    expect((await handleAccountDeletion(request(cloud, { Origin: origin }), deps)).status).toBe(403);
    expect(deps.cookieIdentity).not.toHaveBeenCalled();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });
  it.each(['Basic abc', 'Bearer expired-token', 'Bearer token,second', ''])('does not fall back to cookie identity for explicit invalid auth %s', async authorization => {
    const { deps } = setup();
    expect((await handleAccountDeletion(request(cloud, { Authorization: authorization }), deps)).status).toBe(401);
    expect(deps.cookieIdentity).not.toHaveBeenCalled();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });
  it('uses bearer subject even with another user cookie, forged body, and foreign Origin', async () => {
    const { deps, signOut } = setup();
    deps.verifyBearer = vi.fn(async () => ({ id: bob }));
    const response = await handleAccountDeletion(request(cloud, { Authorization: 'Bearer bob-user-token', Cookie: 'alice-cookie', Origin: 'https://foreign.example.test' }, JSON.stringify({ userId: alice })), deps);
    expect(response.status).toBe(200);
    expect(deps.deleteIdentity).toHaveBeenCalledWith(bob);
    expect(deps.cookieIdentity).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
  it('rejects unverified or malformed identities and cleanup failure without success', async () => {
    const { deps, signOut } = setup();
    deps.cookieIdentity = vi.fn(async () => null);
    expect((await handleAccountDeletion(request(cloud), deps)).status).toBe(401);
    deps.verifyBearer = vi.fn(async () => ({ id: 'malformed' }));
    expect((await handleAccountDeletion(request(cloud, { Authorization: 'Bearer token' }), deps)).status).toBe(401);
    deps.verifyBearer = vi.fn(async () => ({ id: alice }));
    deps.deleteIdentity = vi.fn(async () => { throw new Error('storage cleanup failed'); });
    expect((await handleAccountDeletion(request(cloud, { Authorization: 'Bearer token' }), deps)).status).toBe(503);
    expect(signOut).not.toHaveBeenCalled();
  });
  it('clearly reports missing hosted admin configuration', async () => {
    const { deps } = setup(); deps.hostedAvailable = false;
    const response = await handleAccountDeletion(request(cloud), deps);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('not configured');
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });
});

describe('desktop trusted forwarding', () => {
  it('accepts NextURL loopback normalization only with the exact original listener Host', async () => {
    const { deps } = setup(true);
    const normalized = (host?: string, port = '3100') => new Request(`http://localhost:${port}/api/account`, { method: 'DELETE', headers: { Origin: local, ...(host ? { Host: host } : {}) } });
    expect((await handleAccountDeletion(normalized('127.0.0.1:3100'), deps)).status).toBe(200);
    expect((await handleAccountDeletion(normalized(), deps)).status).toBe(403);
    expect((await handleAccountDeletion(normalized('attacker.test'), deps)).status).toBe(403);
    expect((await handleAccountDeletion(normalized('127.0.0.1:3100', '3101'), deps)).status).toBe(403);
    expect((await handleAccountDeletion(request(local, { Host: 'attacker.test' }), deps)).status).toBe(403);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('forwards only the session token to the fixed endpoint and signs out after hosted success', async () => {
    const { deps, signOut } = setup(true);
    expect((await handleAccountDeletion(request(local, { Cookie: 'private-session' }, JSON.stringify({ userId: bob, url: 'https://attacker.test' })), deps)).status).toBe(200);
    expect(deps.verifyBearer).toHaveBeenCalledWith('alice-user-token');
    expect(deps.fetch).toHaveBeenCalledWith(`${cloud}/api/account`, expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer alice-user-token' }, redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) }));
    const options = vi.mocked(deps.fetch).mock.calls[0][1]!;
    expect(options.body).toBeUndefined();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });
  it.each([{ Origin: cloud }, { Origin: 'http://127.0.0.1:3101' }, { Authorization: 'Bearer alice-user-token' }])('rejects foreign origins or bearer bypass in local runtime %j', async headers => {
    const { deps } = setup(true);
    const present: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) if (value) present[key] = value;
    expect((await handleAccountDeletion(request(local, present), deps)).status).toBe(headers.Authorization ? 401 : 403);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('rejects a different request listener and a token belonging to another subject', async () => {
    const { deps } = setup(true);
    expect((await handleAccountDeletion(request('http://127.0.0.1:3101', { Origin: local }), deps)).status).toBe(403);
    deps.verifyBearer = vi.fn(async () => ({ id: bob }));
    expect((await handleAccountDeletion(request(local), deps)).status).toBe(401);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('reports unavailable when no endpoint is configured without admin fallback', async () => {
    const { deps } = setup(true); delete deps.env.CHATFLOW_ACCOUNT_API_URL;
    const response = await handleAccountDeletion(request(local), deps);
    expect(response.status).toBe(503); expect(await response.text()).toContain('not configured');
    expect(deps.fetch).not.toHaveBeenCalled(); expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500, 302])('propagates hosted refusal %s without clearing the local session and supports retry', async status => {
    const { deps, signOut } = setup(true);
    deps.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('remote details', { status })).mockResolvedValueOnce(Response.json({ ok: true }));
    const response = await handleAccountDeletion(request(local), deps);
    expect(response.status).toBe(status === 401 || status === 403 ? status : 503);
    expect(await response.text()).not.toContain('remote details');
    expect(signOut).not.toHaveBeenCalled();
    expect((await handleAccountDeletion(request(local), deps)).status).toBe(200);
    expect(signOut).toHaveBeenCalledOnce();
  });
  it('rejects bogus successful responses and aborts a timed-out request', async () => {
    const { deps, signOut } = setup(true);
    deps.fetch = vi.fn<typeof fetch>(async () => Response.json({ ok: false }));
    expect((await handleAccountDeletion(request(local), deps)).status).toBe(503);
    deps.timeoutMs = 5;
    deps.fetch = vi.fn<typeof fetch>(async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('timeout')))));
    expect((await handleAccountDeletion(request(local), deps)).status).toBe(503);
    expect(signOut).not.toHaveBeenCalled();
  });
  it.each(['http://account.example.test/api/account', 'https://attacker.test/api/account', `${cloud}/api/account?target=alice`, `${cloud}/other`, 'https://127.0.0.1/api/account', 'https://user:pass@account.example.test/api/account'])('refuses unsafe or unallowlisted destination %s', target => {
    const { deps } = setup(true); deps.env.CHATFLOW_ACCOUNT_API_URL = target;
    expect(desktopAccountEndpoint(deps.env)).toBeNull();
  });
});

describe('storage cleanup before identity deletion', () => {
  function adminFixture(fail: 'attachments' | 'avatars' | 'identity' | null = null, total = 101) {
    const calls: string[] = [];
    const remove = vi.fn(async () => { calls.push('attachments'); return { error: fail === 'attachments' ? new Error('failed') : null }; });
    const list = vi.fn().mockResolvedValueOnce({ data: [{ name: 'avatar.png' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    const avatarRemove = vi.fn(async () => { calls.push('avatars'); return { error: fail === 'avatars' ? new Error('failed') : null }; });
    const deleteUser = vi.fn(async () => { calls.push('identity'); return { error: fail === 'identity' ? new Error('failed') : null }; });
    const rows = Array.from({ length: total }, (_, i) => ({ storage_path: `${alice}/${i}` }));
    const range = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    const query = { then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(resolve), order: () => ({ range }) };
    const admin = { from: vi.fn(() => ({ select: () => ({ eq: () => query }) })), storage: { from: (bucket: string) => bucket === 'chat-attachments' ? { remove } : { list, remove: avatarRemove } }, auth: { admin: { deleteUser } } } as unknown as SupabaseClient;
    return { admin, calls, remove, list, avatarRemove, deleteUser };
  }
  it('removes attachment batches and avatar batches before deleting the verified subject', async () => {
    const fixture = adminFixture();
    await deleteAccountStorageAndIdentity(fixture.admin, alice);
    expect(fixture.calls).toEqual(['attachments', 'attachments', 'avatars', 'identity']);
    expect(fixture.remove.mock.calls).toHaveLength(2);
    expect(fixture.list).toHaveBeenCalledWith(alice, { limit: 100 });
    expect(fixture.avatarRemove).toHaveBeenCalledWith([`${alice}/avatar.png`]);
    expect(fixture.deleteUser).toHaveBeenCalledWith(alice);
  });
  it('removes every attachment beyond the default 1000-row PostgREST response cap', async () => {
    const fixture = adminFixture(null, 1001);
    await deleteAccountStorageAndIdentity(fixture.admin, alice);
    const batches = fixture.remove.mock.calls as unknown as Array<[string[]]>;
    expect(batches.flatMap(([paths]) => paths)).toHaveLength(1001);
    expect(batches.at(-1)?.[0]).toEqual([`${alice}/1000`]);
    expect(fixture.calls.at(-1)).toBe('identity');
  });
  it.each(['attachments', 'avatars'] as const)('stops before deleting identity after %s cleanup error', async stage => {
    const fixture = adminFixture(stage);
    await expect(deleteAccountStorageAndIdentity(fixture.admin, alice)).rejects.toThrow('failed');
    expect(fixture.deleteUser).not.toHaveBeenCalled();
  });
  it('does not treat identity deletion errors as success', async () => {
    const fixture = adminFixture('identity');
    await expect(deleteAccountStorageAndIdentity(fixture.admin, alice)).rejects.toThrow('failed');
  });
});

describe('claimed attachment cleanup authority', () => {
  const attachment = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const conversation = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const path = `${conversation}/${alice}/${attachment}`;
  function fixture(row: unknown = { id: attachment, conversation_id: conversation, uploader_id: alice, message_id: null, storage_path: path }) {
    const rpc = vi.fn().mockResolvedValueOnce({ data: row, error: null }).mockResolvedValue({ data: null, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    return { user: { rpc } as unknown as SupabaseClient, admin: { storage: { from: vi.fn(() => ({ remove })) } } as unknown as SupabaseClient, rpc, remove };
  }
  it('claims under user authority, removes only the claimed path, and finalizes under user authority', async () => {
    const f = fixture();
    await discardClaimedAttachment(f.user, f.admin, attachment, alice);
    expect(f.rpc.mock.calls).toEqual([['claim_attachment_discard', { target_attachment: attachment }], ['discard_attachment', { target_attachment: attachment }]]);
    expect(f.remove).toHaveBeenCalledWith([path]);
  });
  it('does nothing for a null owner/unbound claim, including a retry after finalization', async () => {
    const f = fixture(null);
    await discardClaimedAttachment(f.user, f.admin, attachment, alice);
    expect(f.remove).not.toHaveBeenCalled(); expect(f.rpc).toHaveBeenCalledOnce();
  });
  it.each([{ id: attachment, uploader_id: bob, message_id: null, storage_path: path }, { id: attachment, uploader_id: alice, message_id: attachment, storage_path: path }])('refuses wrong owner or a bound claim %j', async row => {
    const f = fixture(row);
    await expect(discardClaimedAttachment(f.user, f.admin, attachment, alice)).rejects.toThrow('Invalid cleanup claim');
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('retains the claim on Storage error and supports a safe retry', async () => {
    const row = { id: attachment, conversation_id: conversation, uploader_id: alice, message_id: null, storage_path: path };
    const f = fixture(row);
    f.rpc.mockReset().mockResolvedValue({ data: row, error: null });
    f.remove.mockResolvedValueOnce({ data: null, error: new Error('failed') }).mockResolvedValue({ data: [], error: null });
    await expect(discardClaimedAttachment(f.user, f.admin, attachment, alice)).rejects.toThrow('failed');
    expect(f.rpc).toHaveBeenCalledOnce();
    await discardClaimedAttachment(f.user, f.admin, attachment, alice);
    expect(f.rpc.mock.calls[2]).toEqual(['discard_attachment', { target_attachment: attachment }]);
  });
  it('does not report finalization errors as success', async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: null, error: new Error('still exists') });
    await expect(discardClaimedAttachment(f.user, f.admin, attachment, alice)).rejects.toThrow('still exists');
  });
  it('shares origin/bearer guards and forwards a fixed path on the trusted hosted origin without signing out', async () => {
    const { deps, signOut } = setup(true);
    const incoming = new Request(`${local}/api/attachments/${attachment}/discard`, { method: 'POST', headers: { Origin: local, Cookie: 'session' }, body: JSON.stringify({ storage_path: `${bob}/forged` }) });
    expect((await handleAttachmentDiscard(incoming, attachment, deps)).status).toBe(200);
    expect(deps.fetch).toHaveBeenCalledWith(`${cloud}/api/attachments/${attachment}/discard`, expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer alice-user-token' } }));
    expect(signOut).not.toHaveBeenCalled();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });
  it('passes the verified bearer subject/token to hosted claim and never cookie-falls-back', async () => {
    const { deps } = setup(); deps.discardAttachment = vi.fn(async () => {});
    const incoming = new Request(`${cloud}/api/attachments/${attachment}/discard`, { method: 'POST', headers: { Authorization: 'Bearer alice-user-token' } });
    expect((await handleAttachmentDiscard(incoming, attachment, deps)).status).toBe(200);
    expect(deps.discardAttachment).toHaveBeenCalledWith(attachment, alice, 'alice-user-token');
    expect(deps.cookieIdentity).not.toHaveBeenCalled();
    expect((await handleAttachmentDiscard(request(cloud, { Origin: 'https://foreign.example.test' }), attachment, deps)).status).toBe(403);
    expect((await handleAttachmentDiscard(incoming, '../escape', deps)).status).toBe(404);
  });
});

describe('catch-all route integration', () => {
  afterEach(() => vi.unstubAllEnvs());
  const signOut = vi.fn(async () => ({ error: null }));
  const cookieUser = vi.fn();
  const bearerUser = vi.fn();
  const deleteUser = vi.fn(async () => ({ error: null }));
  beforeEach(() => {
    vi.stubEnv('CHATFLOW_RUNTIME', ''); vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', cloud); vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-server-key');
    cookieUser.mockReset().mockResolvedValue({ data: { user: { id: alice, email_confirmed_at: '2026-01-01' } }, error: null });
    bearerUser.mockReset().mockResolvedValue({ data: { user: { id: bob, email_confirmed_at: '2026-01-01' } }, error: null });
    signOut.mockClear(); deleteUser.mockClear(); routeMocks.serverClient.mockReset(); routeMocks.createClient.mockReset();
    routeMocks.serverClient.mockResolvedValue({ auth: { getUser: cookieUser, signOut } });
    routeMocks.createClient.mockImplementation((_url, key) => key === 'public-fixture-key' ? { auth: { getUser: bearerUser } } : {
      from: () => ({ select: () => ({ eq: (_field: string, subject: string) => { expect(subject).toBe(bob); return { order: () => ({ range: async () => ({ data: [], error: null }) }) }; } }) }),
      storage: { from: () => ({ list: async (subject: string) => { expect(subject).toBe(bob); return { data: [], error: null }; } }) },
      auth: { admin: { deleteUser } },
    });
  });
  const context = { params: Promise.resolve({ path: ['account'] }) };
  it('validates explicit bearer via public getUser(token), never reads cookies, and admin deletes only returned identity', async () => {
    const { DELETE } = await import('@/app/api/[...path]/route');
    const response = await DELETE(request(cloud, { Authorization: 'Bearer bob-token', Cookie: 'alice-cookie' }, JSON.stringify({ userId: alice })), context);
    expect(response.status).toBe(200); expect(bearerUser).toHaveBeenCalledWith('bob-token');
    expect(routeMocks.serverClient).not.toHaveBeenCalled(); expect(deleteUser).toHaveBeenCalledWith(bob);
  });
  it('rejects unconfirmed user and invalid bearer without cookie fallback or admin construction', async () => {
    const { DELETE } = await import('@/app/api/[...path]/route');
    bearerUser.mockResolvedValueOnce({ data: { user: { id: bob } }, error: null }).mockResolvedValueOnce({ data: { user: null }, error: new Error('expired') });
    expect((await DELETE(request(cloud, { Authorization: 'Bearer unconfirmed' }), context)).status).toBe(401);
    expect((await DELETE(request(cloud, { Authorization: 'Bearer expired', Cookie: 'valid-alice-cookie' }), context)).status).toBe(401);
    expect(routeMocks.createClient.mock.calls.every(call => call[1] === 'public-fixture-key')).toBe(true);
    expect(routeMocks.serverClient).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled();
  });
  it('rejects forged production origin before querying the cookie session', async () => {
    const { DELETE } = await import('@/app/api/[...path]/route');
    expect((await DELETE(request('https://foreign.example.test'), context)).status).toBe(403);
    expect(routeMocks.serverClient).not.toHaveBeenCalled();
  });
  it('rejects unconfirmed cookie account after a valid canonical origin', async () => {
    const { DELETE } = await import('@/app/api/[...path]/route');
    cookieUser.mockResolvedValue({ data: { user: { id: alice } }, error: null });
    expect((await DELETE(request(cloud), context)).status).toBe(401);
    expect(routeMocks.createClient).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled();
  });
});
