import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// HTTP only: run against an already-started server, never import or seed its DB.
const base = new URL(process.env.CHATFLOW_TEST_URL || 'http://localhost:3100');
assert.ok(['http:', 'https:'].includes(base.protocol), 'CHATFLOW_TEST_URL must be HTTP(S)');
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const accounts = [];
let passed = 0;

class Session {
  cookie = '';

  async request(method, path, { body, raw, form, headers: requestHeaders = {}, expected = [200, 201], binary = false } = {}) {
    const url = new URL(path, base);
    assert.equal(url.origin, base.origin, 'Refusing to send a session to another origin');
    const headers = new Headers();
    if (this.cookie) headers.set('Cookie', this.cookie);
    if (body !== undefined || raw !== undefined) headers.set('Content-Type', 'application/json');
    for (const [name, value] of Object.entries(requestHeaders)) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: form ?? raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const reason = error.cause?.code || error.cause?.errors?.map((e) => e.code).join(', ') || error.message;
      throw new Error(`${method} ${url.origin}${url.pathname}: ${reason}`, { cause: error });
    }
    const cookies = response.headers.getSetCookie();
    for (const cookie of cookies) {
      if (cookie.startsWith('chatflow_session=')) {
        const pair = cookie.split(';', 1)[0];
        this.cookie = pair === 'chatflow_session=' || /Max-Age=0(?:;|$)/i.test(cookie) ? '' : pair;
      }
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const statuses = Array.isArray(expected) ? expected : [expected];
    assert.ok(statuses.includes(response.status),
      `${method} ${url.pathname}: expected ${statuses.join('/')}, got ${response.status}`);
    if (binary) return { response, cookies, bytes };
    assert.match(response.headers.get('content-type') || '', /application\/json/i,
      `${method} ${url.pathname}: expected JSON`);
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { assert.fail(`${method} ${url.pathname}: invalid JSON`); }
    return { response, cookies, data };
  }

  async state() {
    return fullState((await this.request('GET', '/api/state')).data);
  }

  async mutate(method, path, body) {
    return fullState((await this.request(method, path, { body })).data);
  }
}

function fullState(state) {
  assert.ok(state && typeof state === 'object', 'Expected full state');
  for (const key of ['conversations', 'channels', 'contacts', 'blockedUsers']) {
    assert.ok(Array.isArray(state[key]), `state.${key} must be an array`);
  }
  assert.ok(state.settings && typeof state.settings === 'object');
  assert.equal(typeof state.currentUser?.id, 'string');
  assert.equal(typeof state.currentUser?.email, 'string');
  assert.equal(typeof state.migrationCompleted, 'boolean');
  return state;
}

function conversation(state, id) {
  const value = state.conversations.find((item) => item.id === id);
  assert.ok(value, `Conversation ${id} missing`);
  assert.ok(Array.isArray(value.messages));
  return value;
}

function message(state, conversationId, messageId) {
  const value = conversation(state, conversationId).messages.find((item) => item.id === messageId);
  assert.ok(value, `Message ${messageId} missing`);
  return value;
}

function channel(state, id) {
  const value = state.channels.find((item) => item.id === id);
  assert.ok(value, `Channel ${id} missing`);
  return value;
}

function reaction(state, conversationId, messageId, count, reactedByMe) {
  const entries = (message(state, conversationId, messageId).reactions || []).filter((r) => r.emoji === '👍');
  assert.ok(entries.length <= 1, 'An emoji must not have duplicate aggregate entries');
  assert.equal(entries[0]?.count || 0, count);
  assert.equal(Boolean(entries[0]?.reactedByMe), reactedByMe);
}

function authCookie(result) {
  const cookie = result.cookies.find((value) => value.startsWith('chatflow_session='));
  assert.ok(cookie, 'Authentication must set chatflow_session');
  assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
  assert.ok(cookie.split(';', 1)[0].length > 'chatflow_session='.length);
  if (base.protocol === 'https:') assert.match(cookie, /;\s*Secure(?:;|$)/i);
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

async function register(label) {
  const account = {
    email: `api-smoke-${label}-${runId}@example.test`,
    password: `Smoke-${randomUUID()}!`,
    displayName: `API ${label} ${runId}`,
    session: new Session(),
    deleted: false,
  };
  // Track before the request so even assertion failures after creation clean up.
  accounts.push(account);
  const result = await account.session.request('POST', '/api/auth/register', {
    body: { email: account.email, password: account.password, displayName: account.displayName },
  });
  authCookie(result);
  const state = fullState(result.data);
  assert.equal(state.currentUser.email, account.email);
  assert.equal(state.settings.displayName, account.displayName);
  assert.deepEqual(state.conversations, [], 'New accounts must have no demo conversations');
  assert.equal(state.migrationCompleted, false);
  account.id = state.currentUser.id;
  return account;
}

async function login(account) {
  const session = new Session();
  const result = await session.request('POST', '/api/auth/login', {
    body: { email: account.email, password: account.password },
  });
  authCookie(result);
  assert.equal(fullState(result.data).currentUser.id, account.id);
  return session;
}

const cp = (id) => `/api/conversations/${encodeURIComponent(id)}`;
const hp = (id) => `/api/channels/${encodeURIComponent(id)}`;
const denied = [403, 404];
let alice;
let bob;
let aliceFresh;
let dmId;
let sentId;
let publicId;
let publicConversationId;
let privateId;
let privateConversationId;
let privateMessageId;
let uploaded;
const payload = new TextEncoder().encode(`ChatFlow HTTP smoke ${runId}\nUnicode: café, 世界\n\u0000\u0001\u007f`);
const anon = new Session();

try {
  console.log(`ChatFlow API smoke: ${base.origin} (run ${runId})`);
  await check('health and authentication boundaries', async () => {
    assert.equal((await anon.request('GET', '/api/health')).data.ok, true);
    assert.equal(typeof (await anon.request('GET', '/api/auth/options')).data.demoEnabled, 'boolean');
    await anon.request('GET', '/api/state', { expected: 401 });
    for (const [method, path, body] of [
      ['POST', '/api/conversations', { contactId: 'missing' }],
      ['POST', '/api/channels', {}],
      ['POST', '/api/channels/missing/open', {}],
      ['PUT', '/api/channels/missing/membership', { joined: true }],
      ['POST', '/api/channels/missing/members', { contactId: 'missing' }],
      ['POST', '/api/conversations/missing/messages', { content: 'unauthorized' }],
      ['PUT', '/api/conversations/missing/read', {}],
      ['PATCH', '/api/conversations/missing/preferences', { muted: true }],
      ['POST', '/api/conversations/missing/messages/missing/reactions', { emoji: '👍' }],
      ['PATCH', '/api/settings', { theme: 'light' }],
      ['DELETE', '/api/blocked/missing'],
      ['PUT', '/api/blocked/missing', {}],
      ['DELETE', '/api/history'],
      ['DELETE', '/api/account'],
      ['POST', '/api/migrate', {}],
      ['GET', '/api/migrate'],
    ]) await anon.request(method, path, { body, expected: 401 });
    await anon.request('POST', '/api/uploads', { form: new FormData(), expected: 401 });
  });

  await check('two real accounts, blank history, shared directory and public channels', async () => {
    alice = await register('alice');
    bob = await register('bob');
    const a = await alice.session.state();
    const b = await bob.session.state();
    assert.notEqual(a.currentUser.id, b.currentUser.id);
    assert.ok(a.contacts.some((c) => c.id === bob.id && c.email === bob.email));
    assert.ok(b.contacts.some((c) => c.id === alice.id && c.email === alice.email));
    assert.deepEqual(a.channels.filter((c) => !c.isPrivate).map((c) => c.id).sort(),
      b.channels.filter((c) => !c.isPrivate).map((c) => c.id).sort());
    const commonA = a.contacts.filter((c) => ![alice.id, bob.id].includes(c.id)).map((c) => c.id).sort();
    const commonB = b.contacts.filter((c) => ![alice.id, bob.id].includes(c.id)).map((c) => c.id).sort();
    assert.deepEqual(commonA, commonB);
  });

  await check('bad credentials and malformed auth bodies are rejected', async () => {
    await anon.request('POST', '/api/auth/login', {
      body: { email: alice.email, password: 'incorrect-password' }, expected: 401,
    });
    await anon.request('GET', '/api/state', { expected: 401 });
    await anon.request('POST', '/api/auth/login', { raw: '{broken', expected: 400 });
    await anon.request('POST', '/api/auth/register', {
      body: { email: 'invalid', password: 'x', displayName: '' }, expected: 400,
    });
    await anon.request('POST', '/api/auth/login', { body: {}, expected: 400 });
  });

  await check('settings persist across independent login sessions', async () => {
    const state = await alice.session.mutate('PATCH', '/api/settings', {
      theme: 'light', density: 'compact', statusMessage: `persist-${runId}`, soundNotifications: false,
    });
    assert.equal(state.settings.theme, 'light');
    aliceFresh = await login(alice);
    const reloaded = await aliceFresh.state();
    assert.equal(reloaded.settings.theme, 'light');
    assert.equal(reloaded.settings.density, 'compact');
    assert.equal(reloaded.settings.statusMessage, `persist-${runId}`);
    assert.equal(reloaded.settings.soundNotifications, false);
    assert.notEqual((await bob.session.state()).settings.statusMessage, `persist-${runId}`);
  });

  await check('DM creation is reused and delivery is visible to the real recipient', async () => {
    const opened = (await aliceFresh.request('POST', '/api/conversations', { body: { contactId: bob.id } })).data;
    dmId = opened.conversationId;
    assert.equal(typeof dmId, 'string');
    conversation(fullState(opened.state), dmId);
    const again = (await alice.session.request('POST', '/api/conversations', { body: { contactId: bob.id } })).data;
    assert.equal(again.conversationId, dmId);
    const reverse = (await bob.session.request('POST', '/api/conversations', { body: { contactId: alice.id } })).data;
    assert.equal(reverse.conversationId, dmId);
    const sharedUrl = `https://example.test/smoke/${runId}`;
    const content = `hello-${runId} See ${sharedUrl}.`;
    const state = await aliceFresh.mutate('POST', `${cp(dmId)}/messages`, { content });
    const sent = conversation(state, dmId).messages.find((m) => m.content === content);
    assert.ok(sent);
    sentId = sent.id;
    assert.equal(sent.senderId, alice.id);
    assert.equal(sent.isSentByMe, true);
    assert.notEqual(sent.status, 'read', 'A send must not simulate a recipient read');
    const received = await bob.session.state();
    assert.equal(message(received, dmId, sentId).isSentByMe, false);
    assert.equal(message(received, dmId, sentId).content, content);
    for (const view of [state, received]) {
      const links = (conversation(view, dmId).sharedMedia || []).filter((item) => item.type === 'link');
      assert.equal(links.length, 1, 'Message URL must appear once in shared links');
      assert.equal(links[0].url, sharedUrl, 'Shared link must omit trailing sentence punctuation');
      assert.equal(typeof links[0].name, 'string');
      assert.ok(links[0].name.length > 0);
      assert.equal(links[0].date, message(view, dmId, sentId).date);
    }
    assert.equal(conversation(received, dmId).unreadCount, 1);
    assert.equal(conversation(await aliceFresh.state(), dmId).unreadCount, 0);
    assert.equal(conversation(await bob.session.state(), dmId).unreadCount, 1,
      'Polling state must not mark a conversation read');
  });

  await check('mute persists across login sessions, is idempotent, and affects only the caller', async () => {
    const path = `${cp(dmId)}/preferences`;
    const aliceBefore = conversation(await aliceFresh.state(), dmId);
    const bobBefore = conversation(await bob.session.state(), dmId);
    assert.equal(aliceBefore.isMuted, false);
    assert.equal(bobBefore.isMuted, false);
    for (let i = 0; i < 2; i += 1) {
      const state = await aliceFresh.mutate('PATCH', path, { muted: true });
      assert.deepEqual(conversation(state, dmId), { ...aliceBefore, isMuted: true });
    }
    assert.equal(conversation(await alice.session.state(), dmId).isMuted, true);
    const anotherAliceSession = await login(alice);
    assert.equal(conversation(await anotherAliceSession.state(), dmId).isMuted, true);
    assert.deepEqual(conversation(await bob.session.state(), dmId), bobBefore,
      'Muting must not change the peer preference, unread count, or message receipts');
    assert.equal(conversation(await bob.session.mutate('PATCH', path, { muted: true }), dmId).isMuted, true);
    assert.equal(conversation(await (await login(bob)).state(), dmId).isMuted, true);
    for (let i = 0; i < 2; i += 1) {
      assert.equal(conversation(await anotherAliceSession.mutate('PATCH', path, { muted: false }), dmId).isMuted, false);
    }
    assert.equal(conversation(await aliceFresh.state(), dmId).isMuted, false);
    assert.equal(conversation(await bob.session.state(), dmId).isMuted, true,
      'Unmuting Alice must leave Bob muted');
    await bob.session.mutate('PATCH', path, { muted: false });
    assert.deepEqual(conversation(await bob.session.state(), dmId), bobBefore);
  });

  await check('recipient read is persisted, idempotent, and updates sender status', async () => {
    for (let i = 0; i < 2; i += 1) {
      const state = await bob.session.mutate('PUT', `${cp(dmId)}/read`, {});
      assert.equal(conversation(state, dmId).unreadCount, 0);
    }
    assert.equal(message(await aliceFresh.state(), dmId, sentId).status, 'read');
    const bobFresh = await login(bob);
    assert.equal(conversation(await bobFresh.state(), dmId).unreadCount, 0);
  });

  await check('reaction toggles do not duplicate rows and are scoped to each user', async () => {
    const path = `${cp(dmId)}/messages/${encodeURIComponent(sentId)}/reactions`;
    reaction(await aliceFresh.mutate('POST', path, { emoji: '👍' }), dmId, sentId, 1, true);
    reaction(await bob.session.state(), dmId, sentId, 1, false);
    reaction(await bob.session.mutate('POST', path, { emoji: '👍' }), dmId, sentId, 2, true);
    reaction(await aliceFresh.mutate('POST', path, { emoji: '👍' }), dmId, sentId, 1, false);
    reaction(await bob.session.state(), dmId, sentId, 1, true);
    reaction(await bob.session.mutate('POST', path, { emoji: '👍' }), dmId, sentId, 0, false);
    for (let i = 0; i < 2; i += 1) {
      reaction(await aliceFresh.mutate('POST', path, { emoji: '👍' }), dmId, sentId, 1, true);
      reaction(await aliceFresh.mutate('POST', path, { emoji: '👍' }), dmId, sentId, 0, false);
    }
  });

  await check('private channel and its conversation resist cross-user access', async () => {
    const created = (await aliceFresh.request('POST', '/api/channels', { body: {
      name: `smoke-private-${runId}`, description: 'Disposable private API test', category: 'Engineering', isPrivate: true,
    } })).data;
    privateId = created.channel.id;
    assert.equal(created.channel.isPrivate, true);
    assert.equal(channel(fullState(created.state), privateId).isJoined, true);
    const opened = (await aliceFresh.request('POST', `${hp(privateId)}/open`, { body: {} })).data;
    privateConversationId = opened.conversationId;
    conversation(fullState(opened.state), privateConversationId);
    const state = await aliceFresh.mutate('POST', `${cp(privateConversationId)}/messages`, { content: `secret-${runId}` });
    privateMessageId = conversation(state, privateConversationId).messages.find((m) => m.content === `secret-${runId}`).id;
    const outsider = await bob.session.state();
    assert.ok(!outsider.conversations.some((c) => c.id === privateConversationId));
    assert.ok(!outsider.channels.some((c) => c.id === privateId));
    for (const [method, path, body] of [
      ['POST', `${hp(privateId)}/open`, {}],
      ['PUT', `${hp(privateId)}/membership`, { joined: true }],
      ['POST', `${cp(privateConversationId)}/messages`, { content: 'forbidden' }],
      ['PUT', `${cp(privateConversationId)}/read`, {}],
      ['PATCH', `${cp(privateConversationId)}/preferences`, { muted: true }],
      ['POST', `${cp(privateConversationId)}/messages/${encodeURIComponent(privateMessageId)}/reactions`, { emoji: '👍' }],
    ]) await bob.session.request(method, path, { body, expected: denied });
  });

  await check('public join/leave is idempotent and enforces conversation permissions', async () => {
    const created = (await aliceFresh.request('POST', '/api/channels', { body: {
      name: `smoke-public-${runId}`, description: 'Disposable public API test', category: 'General', isPrivate: false,
    } })).data;
    publicId = created.channel.id;
    const initialCount = channel(fullState(created.state), publicId).subscriberCount;
    assert.equal(channel(await bob.session.state(), publicId).isJoined, false);
    await bob.session.request('POST', `${hp(publicId)}/open`, { body: {}, expected: denied });
    for (let i = 0; i < 2; i += 1) {
      const state = await bob.session.mutate('PUT', `${hp(publicId)}/membership`, { joined: true });
      assert.equal(channel(state, publicId).isJoined, true);
      assert.equal(channel(state, publicId).subscriberCount, initialCount + 1);
    }
    const opened = (await bob.session.request('POST', `${hp(publicId)}/open`, { body: {} })).data;
    publicConversationId = opened.conversationId;
    conversation(fullState(opened.state), publicConversationId);
    const ownerOpened = (await aliceFresh.request('POST', `${hp(publicId)}/open`, { body: {} })).data;
    assert.equal(ownerOpened.conversationId, publicConversationId);
    const posted = await bob.session.mutate('POST', `${cp(publicConversationId)}/messages`, { content: `joined-${runId}` });
    const postedId = conversation(posted, publicConversationId).messages.find((m) => m.content === `joined-${runId}`).id;
    for (let i = 0; i < 2; i += 1) {
      const state = await bob.session.mutate('PUT', `${hp(publicId)}/membership`, { joined: false });
      assert.equal(channel(state, publicId).isJoined, false);
      assert.equal(channel(state, publicId).subscriberCount, initialCount);
    }
    for (const [method, path, body] of [
      ['POST', `${hp(publicId)}/open`, {}],
      ['POST', `${cp(publicConversationId)}/messages`, { content: 'after leave' }],
      ['PUT', `${cp(publicConversationId)}/read`, {}],
      ['PATCH', `${cp(publicConversationId)}/preferences`, { muted: true }],
      ['POST', `${cp(publicConversationId)}/messages/${encodeURIComponent(postedId)}/reactions`, { emoji: '👍' }],
    ]) await bob.session.request(method, path, { body, expected: denied });
    await bob.session.mutate('PUT', `${hp(publicId)}/membership`, { joined: true });
  });

  await check('malformed payloads and empty messages produce 400 without writes', async () => {
    const before = conversation(await aliceFresh.state(), dmId).messages.length;
    for (const [method, path, body] of [
      ['POST', `${cp(dmId)}/messages`, {}],
      ['POST', `${cp(dmId)}/messages`, { content: '   ', attachments: [] }],
      ['POST', `${cp(dmId)}/messages`, { content: 17 }],
      ['POST', `${cp(dmId)}/messages`, { content: 'bad attachment', attachments: [{ name: 'x', size: '1 B', type: 'invalid' }] }],
      ['POST', '/api/conversations', {}],
      ['POST', '/api/channels', { name: 'invalid', description: '', category: 'Invalid', isPrivate: false }],
      ['POST', '/api/channels', { name: '___', description: '', category: 'General', isPrivate: false }],
      ['PUT', `${hp(publicId)}/membership`, { joined: 'yes' }],
      ['POST', `${cp(dmId)}/messages/${encodeURIComponent(sentId)}/reactions`, { emoji: '' }],
      ['PATCH', '/api/settings', { theme: 'invalid' }],
      ['PATCH', `${cp(dmId)}/preferences`, { muted: 'true' }],
      ['PATCH', `${cp(dmId)}/preferences`, {}],
      ['POST', '/api/migrate', { conversations: 'invalid' }],
    ]) await aliceFresh.request(method, path, { body, expected: 400 });
    await aliceFresh.request('POST', `${cp(dmId)}/messages`, { raw: '{broken', expected: 400 });
    await aliceFresh.request('POST', '/api/uploads', { form: new FormData(), expected: 400 });
    assert.equal(conversation(await aliceFresh.state(), dmId).messages.length, before);
  });

  await check('cross-origin mutations and invalid JSON/multipart headers are rejected without writes', async () => {
    const before = (await aliceFresh.state()).settings;
    const change = { statusMessage: `must-not-save-${runId}` };
    await aliceFresh.request('PATCH', '/api/settings', {
      body: change, headers: { Origin: 'https://cross-origin.example.invalid' }, expected: 403,
    });
    await aliceFresh.request('PATCH', '/api/settings', {
      body: change, headers: { 'Sec-Fetch-Site': 'cross-site' }, expected: 403,
    });
    await aliceFresh.request('PATCH', '/api/settings', {
      body: change, headers: { 'Content-Type': 'text/plain' }, expected: 415,
    });
    // A byte body avoids fetch automatically supplying text/plain when testing
    // the missing header. Malformed JSON itself is covered in the prior check.
    await aliceFresh.request('PATCH', '/api/settings', {
      raw: new TextEncoder().encode(JSON.stringify(change)), headers: { 'Content-Type': null }, expected: 415,
    });
    await aliceFresh.request('POST', '/api/uploads', { body: { file: 'not-multipart' }, expected: 415 });
    await aliceFresh.request('POST', '/api/uploads', {
      raw: 'invalid multipart', headers: { 'Content-Type': 'multipart/form-data' }, expected: 400,
    });
    await aliceFresh.request('POST', '/api/uploads', {
      raw: '--smoke-boundary\r\nContent-Disposition: form-data; name="file"; filename="broken.txt"\r\n',
      headers: { 'Content-Type': 'multipart/form-data; boundary=smoke-boundary' }, expected: 400,
    });
    assert.deepEqual((await aliceFresh.state()).settings, before, 'Rejected mutations must not update settings');
  });

  await check('uploads preserve bytes and require authenticated sharing permission', async () => {
    const form = new FormData();
    form.append('file', new Blob([payload], { type: 'text/plain' }), `smoke-${runId}.txt`);
    uploaded = (await aliceFresh.request('POST', '/api/uploads', { form })).data;
    assert.equal(uploaded.name, `smoke-${runId}.txt`);
    assert.equal(uploaded.type, 'doc');
    assert.equal(typeof uploaded.size, 'string');
    assert.equal(typeof uploaded.url, 'string');
    assert.ok(uploaded.url.length > 0);
    const download = await aliceFresh.request('GET', uploaded.url, { binary: true });
    assert.deepEqual(download.bytes, payload);
    await anon.request('GET', uploaded.url, { expected: 401, binary: true });
    await bob.session.request('GET', uploaded.url, { expected: denied, binary: true });
    await aliceFresh.mutate('POST', `${cp(privateConversationId)}/messages`, { content: '', attachments: [uploaded] });
    await bob.session.request('GET', uploaded.url, { expected: denied, binary: true });
    const shared = await aliceFresh.mutate('POST', `${cp(dmId)}/messages`, { content: '', attachments: [uploaded] });
    assert.ok(conversation(shared, dmId).messages.some((m) => m.attachments?.some((a) => a.url === uploaded.url)));
    const bobState = await bob.session.state();
    assert.ok(conversation(bobState, dmId).messages.some((m) => m.attachments?.some((a) => a.url === uploaded.url)));
    assert.deepEqual((await bob.session.request('GET', uploaded.url, { binary: true })).bytes, payload);
  });

  await check('channel attachment access is revoked on leave and restored on rejoin', async () => {
    const form = new FormData();
    form.append('file', new Blob([payload], { type: 'text/plain' }), `channel-${runId}.txt`);
    const attachment = (await aliceFresh.request('POST', '/api/uploads', { form })).data;
    await aliceFresh.mutate('POST', `${cp(publicConversationId)}/messages`, { content: 'channel file', attachments: [attachment] });
    assert.deepEqual((await bob.session.request('GET', attachment.url, { binary: true })).bytes, payload);
    await bob.session.mutate('PUT', `${hp(publicId)}/membership`, { joined: false });
    await bob.session.request('GET', attachment.url, { expected: denied, binary: true });
    await bob.session.mutate('PUT', `${hp(publicId)}/membership`, { joined: true });
    assert.deepEqual((await bob.session.request('GET', attachment.url, { binary: true })).bytes, payload);
  });

  await check('blocking is idempotent, prevents both directions of DM sending, and can be undone', async () => {
    const path = `/api/blocked/${encodeURIComponent(bob.id)}`;
    for (let i = 0; i < 2; i += 1) {
      const state = await aliceFresh.mutate('PUT', path, {});
      assert.equal(state.blockedUsers.filter((u) => u.id === bob.id).length, 1);
      assert.ok(!state.contacts.some((c) => c.id === bob.id));
    }
    for (const [session, peerId] of [[aliceFresh, bob.id], [bob.session, alice.id]]) {
      await session.request('POST', `${cp(dmId)}/messages`, { body: { content: 'blocked' }, expected: 403 });
      await session.request('POST', '/api/conversations', { body: { contactId: peerId }, expected: 403 });
    }
    for (let i = 0; i < 2; i += 1) {
      const state = await aliceFresh.mutate('DELETE', path);
      assert.ok(!state.blockedUsers.some((u) => u.id === bob.id));
      assert.ok(state.contacts.some((c) => c.id === bob.id));
    }
    const state = await bob.session.mutate('POST', `${cp(dmId)}/messages`, { content: `unblocked-${runId}` });
    assert.ok(conversation(state, dmId).messages.some((m) => m.content === `unblocked-${runId}`));
  });

  await check('unblocking an absent ID is harmless and isolated', async () => {
    const before = await bob.session.state();
    const state = await aliceFresh.mutate('DELETE', `/api/blocked/${encodeURIComponent(`absent-${runId}`)}`);
    assert.ok(!state.blockedUsers.some((u) => u.id === `absent-${runId}`));
    assert.deepEqual((await bob.session.state()).blockedUsers, before.blockedUsers);
  });

  await check('legacy migration is additive, one-time, and cannot seize inaccessible IDs', async () => {
    const legacyName = `legacy-conversation-${runId}`;
    const legacyChannelName = `legacy-channel-${runId}`;
    const legacy = {
      conversations: [{
        id: `legacy-${runId}`, name: legacyName, type: 'group', lastMessage: 'legacy hello',
        lastMessageTime: '12:00 PM', unreadCount: 0,
        messages: [{ id: `legacy-message-${runId}`, senderId: 'user-me', senderName: bob.displayName,
          content: 'legacy hello', timestamp: '12:00 PM', date: 'Today', isSentByMe: true, status: 'sent',
          attachments: [
            { name: 'legacy-only.pdf', size: '12 KB', type: 'pdf', url: 'https://example.test/legacy-only.pdf' },
            { name: 'local-only.txt', size: '1 KB', type: 'doc', url: 'file:///legacy-only.txt' },
            { name: 'metadata-only.txt', size: '2 KB', type: 'doc' },
          ],
          reactions: [{ emoji: '👍', count: 7, reactedByMe: true }] }],
        sharedMedia: [{ id: 'legacy-media', name: 'legacy-only.pdf', type: 'file', size: '12 KB', date: 'Today' }],
      }],
      channels: [{ id: `legacy-channel-${runId}`, name: legacyChannelName, description: 'Legacy smoke test',
        category: 'Random', isPrivate: true, subscriberCount: 1, isJoined: true }],
      settings: { density: 'compact', statusMessage: `legacy-status-${runId}` },
    };
    const beforeOwner = await aliceFresh.state();
    await bob.session.request('GET', '/api/migrate', { expected: 404 });
    const malicious = structuredClone(legacy);
    malicious.conversations[0].id = privateConversationId;
    malicious.channels[0].id = privateId;
    const attempt = await bob.session.request('POST', '/api/migrate', {
      body: malicious, expected: [200, 201, 400, 403, 404, 409],
    });
    // Either reject the whole collision or import it under caller-owned IDs.
    const migrated = attempt.response.ok ? fullState(attempt.data)
      : await bob.session.mutate('POST', '/api/migrate', legacy);
    assert.equal(migrated.migrationCompleted, true);
    assert.ok(!migrated.conversations.some((c) => c.id === privateConversationId));
    assert.ok(!migrated.channels.some((c) => c.id === privateId));
    const isLegacyConversation = (c) => c.name === legacyName || c.name === `${legacyName} (imported)`;
    const isLegacyChannel = (c) => c.name === legacyChannelName || c.name.startsWith(`${legacyChannelName}-`);
    const imported = migrated.conversations.filter(isLegacyConversation);
    assert.equal(imported.length, 1);
    assert.equal(imported[0].isArchived, true);
    assert.equal(imported[0].messages.filter((m) => m.content === 'legacy hello').length, 1);
    const historicalFiles = imported[0].messages.find((m) => m.content === 'legacy hello').attachments;
    assert.deepEqual(historicalFiles, [
      legacy.conversations[0].messages[0].attachments[0],
      { name: 'local-only.txt', size: '1 KB', type: 'doc' },
      { name: 'metadata-only.txt', size: '2 KB', type: 'doc' },
    ], 'Archives display attachment metadata while retaining only HTTP(S) links');
    await bob.session.request('POST', `${cp(imported[0].id)}/messages`, {
      body: { content: 'cannot spoof imported history' }, expected: 409,
    });
    assert.equal(migrated.channels.filter(isLegacyChannel).length, 1);
    assert.equal(migrated.settings.statusMessage, `legacy-status-${runId}`);
    message(migrated, dmId, sentId);
    channel(migrated, publicId);
    const afterOwner = await aliceFresh.state();
    assert.deepEqual(conversation(afterOwner, privateConversationId), conversation(beforeOwner, privateConversationId));
    assert.deepEqual(channel(afterOwner, privateId), channel(beforeOwner, privateId));
    await bob.session.request('POST', `${hp(privateId)}/open`, { body: {}, expected: denied });
    await bob.session.request('POST', `${cp(privateConversationId)}/messages`, { body: { content: 'still forbidden' }, expected: denied });
    await bob.session.mutate('POST', '/api/migrate', legacy);
    const modified = structuredClone(legacy);
    modified.conversations[0].name = `must-not-import-${runId}`;
    modified.channels[0].name = `must-not-import-channel-${runId}`;
    modified.settings.statusMessage = 'must-not-overwrite';
    const repeated = await bob.session.mutate('POST', '/api/migrate', modified);
    assert.deepEqual(repeated, migrated, 'Subsequent imports must be state-preserving no-ops');
    const persisted = await (await login(bob)).state();
    assert.equal(persisted.migrationCompleted, true);
    assert.equal(persisted.conversations.filter(isLegacyConversation).length, 1);
    assert.equal(persisted.channels.filter(isLegacyChannel).length, 1);
    assert.equal(persisted.settings.statusMessage, `legacy-status-${runId}`);
    const backup = await bob.session.request('GET', '/api/migrate');
    assert.match(backup.response.headers.get('content-disposition') || '', /attachment;.*filename/i);
    assert.deepEqual(backup.data, attempt.response.ok ? malicious : legacy,
      'The original snapshot must preserve attachment/reaction/media metadata across repeated imports');
    await aliceFresh.request('GET', '/api/migrate', { expected: 404 });
  });

  await check('only the owner can invite private members, and nonowners can leave', async () => {
    await bob.session.request('POST', `${hp(privateId)}/members`, { body: { contactId: bob.id }, expected: 403 });
    await aliceFresh.request('PUT', `${hp(privateId)}/membership`, { body: { joined: false }, expected: 409 });
    const before = channel(await aliceFresh.state(), privateId).subscriberCount;
    for (let i = 0; i < 2; i += 1) {
      const state = await aliceFresh.mutate('POST', `${hp(privateId)}/members`, { contactId: bob.id });
      assert.equal(channel(state, privateId).subscriberCount, before + 1);
    }
    const state = await bob.session.state();
    assert.equal(channel(state, privateId).isJoined, true);
    assert.equal(message(state, privateConversationId, privateMessageId).content, `secret-${runId}`);
    const opened = (await bob.session.request('POST', `${hp(privateId)}/open`, { body: {} })).data;
    assert.equal(opened.conversationId, privateConversationId);
    await bob.session.request('POST', `${hp(privateId)}/members`, { body: { contactId: alice.id }, expected: 403 });
    await bob.session.mutate('PUT', `${hp(privateId)}/membership`, { joined: false });
    await bob.session.request('POST', `${hp(privateId)}/open`, { body: {}, expected: denied });
    await bob.session.request('PUT', `${hp(privateId)}/membership`, { body: { joined: true }, expected: denied });
  });

  await check('clear history affects only the caller and survives a new login', async () => {
    // Clearing also advances the caller's read cursor, legitimately changing
    // the sender's receipt. Compare durable history separately from receipts.
    const withoutReceipts = (messages) => messages.map(({ status, ...rest }) => rest);
    const recipientBefore = withoutReceipts(conversation(await bob.session.state(), dmId).messages);
    const callerBefore = await aliceFresh.state();
    const oldIds = new Set(callerBefore.conversations.flatMap((c) => c.messages.map((m) => m.id)));
    const cleared = await aliceFresh.mutate('DELETE', '/api/history');
    assert.ok(cleared.conversations.every((c) => c.messages.length === 0));
    assert.deepEqual(withoutReceipts(conversation(await bob.session.state(), dmId).messages), recipientBefore);
    const afterLogin = await (await login(alice)).state();
    assert.ok(afterLogin.conversations.every((c) => c.messages.length === 0));
    assert.equal(afterLogin.settings.statusMessage, callerBefore.settings.statusMessage);
    const freshText = `after-clear-${runId}`;
    await bob.session.mutate('POST', `${cp(dmId)}/messages`, { content: freshText });
    const received = await aliceFresh.state();
    assert.ok(conversation(received, dmId).messages.some((m) => m.content === freshText));
    assert.ok(conversation(received, dmId).messages.every((m) => !oldIds.has(m.id)), 'Old history must stay hidden');
    assert.equal(conversation(received, dmId).unreadCount, 1);
  });

  await check('logout clears the cookie and invalidates the saved session', async () => {
    const temporary = await login(bob);
    const stale = new Session();
    stale.cookie = temporary.cookie;
    const result = await temporary.request('POST', '/api/auth/logout', { body: {} });
    const clearedCookie = result.cookies.find((value) => value.startsWith('chatflow_session='));
    assert.ok(clearedCookie, 'Logout must explicitly clear the browser cookie');
    assert.ok(/chatflow_session=;|Max-Age=0(?:;|$)/i.test(clearedCookie));
    assert.equal(temporary.cookie, '');
    await temporary.request('GET', '/api/state', { expected: 401 });
    await stale.request('GET', '/api/state', { expected: 401 });
    assert.equal((await bob.session.state()).currentUser.id, bob.id);
  });

  await check('account deletion revokes sessions, deletes solo channels, transfers shared ownership, and never reseeds', async () => {
    const solo = (await aliceFresh.request('POST', '/api/channels', { body: {
      name: `smoke-solo-${runId}`, description: 'Disposable solo-owner deletion test', category: 'General', isPrivate: false,
    } })).data;
    assert.equal(channel(fullState(solo.state), solo.channel.id).isOwner, true);
    const bobBefore = await bob.session.state();
    channel(bobBefore, solo.channel.id);
    assert.equal(channel(bobBefore, publicId).isOwner, false);
    const retainedMessageIds = conversation(bobBefore, publicConversationId).messages
      .filter((m) => m.senderId === bob.id).map((m) => m.id);
    assert.ok(retainedMessageIds.length > 0);
    const stale = new Session();
    stale.cookie = aliceFresh.cookie;
    const result = await aliceFresh.request('DELETE', '/api/account');
    assert.equal(result.data.ok, true);
    alice.deleted = true;
    for (const session of [aliceFresh, alice.session, stale, anon]) {
      await session.request('GET', '/api/state', { expected: 401 });
      await session.request('GET', '/api/state', { expected: 401 });
    }
    await anon.request('POST', '/api/auth/login', {
      body: { email: alice.email, password: alice.password }, expected: 401,
    });
    const bobAfter = await bob.session.state();
    assert.equal(bobAfter.currentUser.id, bob.id);
    assert.ok(!bobAfter.channels.some((c) => c.id === solo.channel.id), 'A solo-owned channel must be deleted');
    assert.equal(channel(bobAfter, publicId).isOwner, true, 'Remaining member must become owner');
    assert.equal(channel(bobAfter, publicId).subscriberCount, 1);
    for (const id of retainedMessageIds) message(bobAfter, publicConversationId, id);
    await bob.session.request('PUT', `${hp(publicId)}/membership`, { body: { joined: false }, expected: 409 });
  });
} catch (error) {
  console.error(`not ok ${passed + 1} - ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  // Never use demo auth: cleanup operates exclusively on generated credentials.
  for (const account of [...accounts].reverse()) {
    if (account.deleted) continue;
    try {
      let session = account.session;
      const probe = await session.request('GET', '/api/state', { expected: [200, 401] });
      if (probe.response.status === 401) {
        session = new Session();
        const result = await session.request('POST', '/api/auth/login', {
          body: { email: account.email, password: account.password }, expected: [200, 401],
        });
        if (result.response.status === 401) continue; // Registration never succeeded, or already deleted.
      }
      assert.equal((await session.request('DELETE', '/api/account')).data.ok, true);
      account.deleted = true;
      console.log(`cleanup - deleted ${account.email}`);
    } catch (error) {
      process.exitCode = 1;
      console.error(`cleanup failed for ${account.email}: ${error.message}`);
    }
  }
  console.log(`${passed} API smoke checks passed${process.exitCode ? '; run FAILED' : '; run passed'}.`);
}
