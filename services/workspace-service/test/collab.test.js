// Live collaboration tests: real Socket.IO clients + real Yjs documents against the real server,
// Postgres and Redis. Each "user" below is a separate socket with its own Y.Doc, like a browser tab.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { io } from 'socket.io-client';
import { WorkspaceCollab, createCollabSocket, watchRoom } from '../client/collabProvider.js';

process.env.JWT_SECRET ||= 'test-secret';
process.env.COLLAB_SAVE_INTERVAL_MS = '100';
process.env.COLLAB_UNLOAD_GRACE_MS = '300';

const users = {
  alice: { userId: randomUUID(), username: 'alice' },
  bob: { userId: randomUUID(), username: 'bob' },
  carol: { userId: randomUUID(), username: 'carol' }, // never joins any room
};
const tokenFor = (name) =>
  jwt.sign({ userId: users[name].userId, email: `${name}@t.dev`, username: name }, process.env.JWT_SECRET);

let httpServer, collab, authStub, execStub, base, redis, prisma, MAX_CODE_LENGTH;
const knownRooms = new Set();
const execCalls = [];
const openSockets = [];
const openClients = [];

before(async () => {
  authStub = http.createServer((req, res) => {
    res.statusCode = knownRooms.has(req.url.split('/')[2]) ? 200 : 404;
    res.end('{}');
  });
  await new Promise((r) => authStub.listen(0, '127.0.0.1', r));
  process.env.USER_AUTH_URL = `http://127.0.0.1:${authStub.address().port}`;

  execStub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      execCalls.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stdout: '42\n', stderr: '', exitCode: 0, timedOut: false, oomKilled: false, truncated: false, durationMs: 7 }));
    });
  });
  await new Promise((r) => execStub.listen(0, '127.0.0.1', r));
  process.env.EXECUTION_URL = `http://127.0.0.1:${execStub.address().port}`;

  ({ default: redis } = await import('../src/lib/redis.js'));
  ({ default: prisma } = await import('../src/lib/prisma.js'));
  ({ MAX_CODE_LENGTH } = await import('../src/lib/config.js'));
  const { createServer } = await import('../src/server.js');
  ({ server: httpServer, collab } = createServer());
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${httpServer.address().port}`;
});

afterEach(() => {
  while (openClients.length) openClients.pop().destroy({ notify: false }); // stops the awareness timers
  while (openSockets.length) openSockets.pop().disconnect();
});

after(async () => {
  await collab.shutdown();
  await prisma.workspace.deleteMany({ where: { roomId: { in: [...knownRooms] } } });
  for (const r of knownRooms) await redis.del(`room:${r}:members`);
  await prisma.$disconnect();
  await redis.quit();
  httpServer.close();
  authStub.close();
  execStub.close();
});

// ------------------------------------------------------------------ helpers
async function api(method, path, who, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(who)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function waitFor(condition, { timeout = 4000, label = 'condition' } = {}) {
  const started = Date.now();
  for (;;) {
    let value;
    try {
      value = await condition();
    } catch {
      /* not yet */
    }
    if (value) return value;
    if (Date.now() - started > timeout) assert.fail(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// A fresh room where alice and bob have "joined" (carol has not), plus alice's workspace.
async function setup(sharingMode = 'PRIVATE', { grantBob = false } = {}) {
  const roomId = randomUUID();
  knownRooms.add(roomId);
  await redis.hset(`room:${roomId}:members`, users.alice.userId, 'alice', users.bob.userId, 'bob');
  const created = await api('POST', '/workspaces', 'alice', { roomId, language: 'python' });
  const workspaceId = created.body.workspace.id;
  if (sharingMode !== 'PRIVATE') await api('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode });
  if (grantBob) await api('PUT', `/workspaces/${workspaceId}/editors/${users.bob.userId}`, 'alice');
  return { roomId, workspaceId };
}

function connectSocket(who, token = tokenFor(who)) {
  const socket = createCollabSocket({ url: base, token });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

// Opens a workspace the way a browser tab would; resolves once the first sync is done.
async function open(who, workspaceId, { expectError = false } = {}) {
  const socket = await connectSocket(who);
  const client = new WorkspaceCollab(socket, workspaceId, { user: { name: who, color: '#888' } });
  openClients.push(client);
  const outcome = await new Promise((resolve) => {
    client.on('synced', () => resolve('synced'));
    client.on('error', (e) => resolve(e.error));
  });
  if (!expectError) assert.equal(outcome, 'synced');
  return { socket, client, text: client.text, outcome };
}

const insert = (client, index, str) => client.doc.transact(() => client.text.insert(index, str));
const rawUpdate = (text) => {
  const d = new Y.Doc();
  d.getText('code').insert(0, text);
  return Y.encodeStateAsUpdate(d);
};
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

// -------------------------------------------------------------------- tests
test('sockets without a valid token are refused', async () => {
  await assert.rejects(connectSocket('alice', 'not-a-token'), /unauthorized/);
  const anon = io(base, { path: '/collab/socket.io' });
  openSockets.push(anon);
  await new Promise((resolve) => anon.once('connect_error', (e) => resolve(assert.match(e.message, /unauthorized/))));
});

test('typing syncs live to a viewer; the viewer is strictly read-only', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  assert.equal(alice.client.readOnly, false);
  assert.equal(bob.client.readOnly, true);

  insert(alice.client, 0, 'print("hello")');
  await waitFor(() => bob.text.toString() === 'print("hello")', { label: 'bob sees alice typing' });

  // a hacked client bypassing the UI: the server must refuse and nobody must see it
  const hack = await emitAck(bob.socket, 'yjs:update', { workspaceId, update: rawUpdate('HACKED') });
  assert.deepEqual(hack, { ok: false, error: 'forbidden' });
  // and the normal provider doesn't even send local edits made while read-only
  insert(bob.client, 0, 'LOCAL ');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(alice.text.toString(), 'print("hello")');
  assert.equal(collab.sessions.get(workspaceId).text.toString(), 'print("hello")');
});

test('strangers cannot join: private workspace, or someone who never joined the room', async () => {
  const priv = await setup('PRIVATE');
  assert.equal((await open('bob', priv.workspaceId, { expectError: true })).outcome, 'not_found');

  const shared = await setup('VIEW_ONLY');
  assert.equal((await open('carol', shared.workspaceId, { expectError: true })).outcome, 'not_found');
  assert.equal((await open('bob', randomUUID(), { expectError: true })).outcome, 'not_found');
});

test('collaborative: two editors typing at the same time converge', async () => {
  const { workspaceId } = await setup('COLLABORATIVE', { grantBob: true });
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  assert.equal(bob.client.permissions.canEdit, true);

  for (let i = 0; i < 20; i++) {
    insert(alice.client, 0, 'A');
    insert(bob.client, 0, 'B');
  }
  await waitFor(() => alice.text.length === 40 && alice.text.toString() === bob.text.toString(), { label: 'both converge' });
  assert.equal(collab.sessions.get(workspaceId).text.toString(), alice.text.toString());
  assert.equal([...alice.text.toString()].filter((c) => c === 'A').length, 20);
});

test('late joiner receives the full current document', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  const alice = await open('alice', workspaceId);
  insert(alice.client, 0, 'x = 1\ny = 2\n');
  const bob = await open('bob', workspaceId);
  assert.equal(bob.text.toString(), 'x = 1\ny = 2\n');
});

test('content saved through REST seeds the live document', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  assert.equal((await api('PUT', `/workspaces/${workspaceId}/code`, 'alice', { code: 'seeded = True' })).status, 200);
  const alice = await open('alice', workspaceId);
  assert.equal(alice.text.toString(), 'seeded = True');
  const row = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  assert.ok(row.yjsState, 'document state was persisted');
  assert.equal(row.code, 'seeded = True');
});

test('permissions change live: grant revoked, then workspace made private', async () => {
  const { workspaceId } = await setup('COLLABORATIVE', { grantBob: true });
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);

  const demoted = new Promise((resolve) => bob.client.on('permissions', resolve));
  await api('DELETE', `/workspaces/${workspaceId}/editors/${users.bob.userId}`, 'alice');
  assert.equal((await demoted).canEdit, false);
  assert.equal(bob.client.readOnly, true);
  assert.equal((await emitAck(bob.socket, 'yjs:update', { workspaceId, update: rawUpdate('x') })).error, 'forbidden');

  await api('PUT', `/workspaces/${workspaceId}/editors/${users.bob.userId}`, 'alice');
  await waitFor(() => bob.client.permissions.canEdit, { label: 'bob can edit again' });
  insert(bob.client, 0, 'back');
  await waitFor(() => alice.text.toString() === 'back');

  const revoked = new Promise((resolve) => bob.client.on('revoked', resolve));
  await api('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode: 'PRIVATE' });
  await revoked;
  assert.equal(bob.client.closed, true);
  await waitFor(async () => (await emitAck(bob.socket, 'yjs:update', { workspaceId, update: rawUpdate('y') })).error === 'not_joined');
  assert.equal(alice.text.toString(), 'back');
});

test('presence: who is here, viewing vs editing, also visible in the REST list', async () => {
  const { roomId, workspaceId } = await setup('VIEW_ONLY');
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);

  await waitFor(() => alice.client.presence.length === 2, { label: 'alice sees both users' });
  assert.deepEqual(
    alice.client.presence.map((u) => [u.username, u.mode]),
    [['alice', 'editing'], ['bob', 'viewing']]
  );
  const list = await api('GET', `/workspaces?roomId=${roomId}`, 'bob');
  assert.deepEqual(list.body.workspaces[0].presence, { activeUsers: 2, ownerOnline: true });

  bob.socket.disconnect();
  await waitFor(() => alice.client.presence.length === 1, { label: 'bob disappears from presence' });
  const after = await api('GET', `/workspaces?roomId=${roomId}`, 'alice');
  assert.deepEqual(after.body.workspaces[0].presence, { activeUsers: 1, ownerOnline: true });

  alice.socket.disconnect();
  await waitFor(async () => (await api('GET', `/workspaces?roomId=${roomId}`, 'bob')).body.workspaces[0].presence.ownerOnline === false, { label: 'owner offline' });
});

test('cursors (awareness) are shared and cleaned up when someone leaves', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);

  alice.client.awareness.setLocalStateField('cursor', { index: 3 });
  await waitFor(() => [...bob.client.awareness.getStates().values()].some((s) => s.user?.name === 'alice' && s.cursor?.index === 3), {
    label: "bob sees alice's cursor",
  });
  alice.socket.disconnect();
  await waitFor(() => ![...bob.client.awareness.getStates().values()].some((s) => s.user?.name === 'alice'), { label: "alice's cursor removed" });
});

test('edits are saved to PostgreSQL and survive the session being unloaded', async () => {
  const { workspaceId } = await setup('PRIVATE');
  const alice = await open('alice', workspaceId);
  insert(alice.client, 0, 'persisted = True');
  await waitFor(async () => (await prisma.workspace.findUnique({ where: { id: workspaceId } })).code === 'persisted = True', { label: 'saved to DB' });

  alice.socket.disconnect();
  await waitFor(() => !collab.sessions.has(workspaceId), { label: 'session unloaded after grace period' });

  const row = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const check = new Y.Doc();
  Y.applyUpdate(check, row.yjsState);
  assert.equal(check.getText('code').toString(), 'persisted = True');

  const again = await open('alice', workspaceId);
  assert.equal(again.text.toString(), 'persisted = True');
});

test('REST save while people are editing converges everyone; GET returns the live text', async () => {
  const { workspaceId } = await setup('COLLABORATIVE', { grantBob: true });
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  insert(alice.client, 0, 'old');
  await waitFor(() => bob.text.toString() === 'old');

  assert.equal((await api('PUT', `/workspaces/${workspaceId}/code`, 'alice', { code: 'replaced' })).status, 200);
  await waitFor(() => alice.text.toString() === 'replaced' && bob.text.toString() === 'replaced', { label: 'both see the REST save' });

  insert(bob.client, 8, '!');
  const read = await api('GET', `/workspaces/${workspaceId}`, 'alice'); // immediately, before the DB save
  assert.equal(read.body.workspace.code === 'replaced' || read.body.workspace.code === 'replaced!', true);
});

test('Run uses the live document and shows the result to everyone watching', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  const events = [];
  bob.client.on('run:started', (m) => events.push(['started', m.by]));
  bob.client.on('run:result', (m) => events.push(['result', m.by, m.result.stdout]));

  insert(alice.client, 0, 'print(42)');
  await waitFor(() => bob.text.toString() === 'print(42)');
  const run = await api('POST', `/workspaces/${workspaceId}/run`, 'alice', { code: 'IGNORED: the live document wins' });
  assert.equal(run.status, 200);
  assert.equal(execCalls.at(-1).code, 'print(42)');

  await waitFor(() => events.length === 2, { label: 'viewer sees run events' });
  assert.deepEqual(events, [['started', 'alice'], ['result', 'alice', '42\n']]);
  assert.equal((await api('POST', `/workspaces/${workspaceId}/run`, 'bob', {})).status, 403, 'viewers cannot run');
});

test('offline edits are merged when a client reconnects', async () => {
  const { workspaceId } = await setup('COLLABORATIVE', { grantBob: true });
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  insert(alice.client, 0, 'base\n');
  await waitFor(() => bob.text.toString() === 'base\n');

  bob.socket.disconnect();
  await waitFor(() => bob.client.synced === false);
  insert(bob.client, bob.text.length, 'from-bob-offline\n');
  insert(alice.client, alice.text.length, 'from-alice\n');

  bob.socket.connect();
  await waitFor(() => bob.client.synced, { label: 'bob re-synced' });
  await waitFor(() => alice.text.toString() === bob.text.toString() && alice.text.length === 'base\nfrom-bob-offline\nfrom-alice\n'.length, { label: 'both have both edits' });
  assert.match(alice.text.toString(), /from-bob-offline/);
  assert.match(bob.text.toString(), /from-alice/);
});

test('oversized documents are trimmed server-side to the same limit as the REST API', async () => {
  const { workspaceId } = await setup('PRIVATE');
  const alice = await open('alice', workspaceId);
  insert(alice.client, 0, 'x'.repeat(MAX_CODE_LENGTH + 500));
  await waitFor(() => collab.sessions.get(workspaceId).text.length <= MAX_CODE_LENGTH, { label: 'server trimmed it' });
  await waitFor(() => alice.text.length <= MAX_CODE_LENGTH, { label: 'client received the trim' });
  assert.equal(collab.sessions.get(workspaceId).text.length, MAX_CODE_LENGTH);
});

test('malformed updates are rejected without breaking the session', async () => {
  const { workspaceId } = await setup('PRIVATE');
  const alice = await open('alice', workspaceId);
  assert.equal((await emitAck(alice.socket, 'yjs:update', { workspaceId, update: 'not binary' })).error, 'bad_update');
  assert.equal((await emitAck(alice.socket, 'yjs:update', { workspaceId, update: new Uint8Array([9, 9, 9, 9]) })).error, 'bad_update');
  assert.equal((await emitAck(alice.socket, 'yjs:update', { workspaceId, update: new Uint8Array(300_000) })).error, 'bad_update');
  insert(alice.client, 0, 'still works');
  await waitFor(() => collab.sessions.get(workspaceId).text.toString() === 'still works');
});

test('a viewer can ask the owner for edit access (once per 30 s)', async () => {
  const { workspaceId } = await setup('COLLABORATIVE');
  const alice = await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  const received = new Promise((resolve) => alice.socket.once('edit:requested', resolve));

  assert.deepEqual(await bob.client.requestEditAccess(), { ok: true });
  const msg = await received;
  assert.equal(msg.username, 'bob');
  assert.equal(msg.userId, users.bob.userId);
  assert.equal(msg.workspaceId, workspaceId);
  assert.equal((await bob.client.requestEditAccess()).error, 'already_requested');
  assert.equal((await alice.client.requestEditAccess()).error, 'not_applicable', 'owners need not ask');
  await redis.del(`editreq:${workspaceId}:${users.bob.userId}`);
});

test('the room channel announces changes so the Shared Workspaces list can refresh', async () => {
  const roomId = randomUUID();
  knownRooms.add(roomId);
  await redis.hset(`room:${roomId}:members`, users.alice.userId, 'alice', users.bob.userId, 'bob');

  const aliceSocket = await connectSocket('alice');
  const changes = [];
  watchRoom(aliceSocket, roomId, (m) => changes.push(m.roomId));
  await new Promise((r) => setTimeout(r, 100));

  const created = await api('POST', '/workspaces', 'bob', { roomId });
  await waitFor(() => changes.length >= 1, { label: 'alice told about bob\'s new workspace' });
  const before = changes.length;
  await api('PATCH', `/workspaces/${created.body.workspace.id}`, 'bob', { sharingMode: 'VIEW_ONLY' });
  await waitFor(() => changes.length > before, { label: 'alice told about the sharing change' });

  const carolSocket = await connectSocket('carol');
  assert.equal((await emitAck(carolSocket, 'room:subscribe', { roomId })).ok, false, 'non-members cannot subscribe');
});

test('deleting a workspace removes everyone from it', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  await open('alice', workspaceId);
  const bob = await open('bob', workspaceId);
  const deleted = new Promise((resolve) => bob.client.on('deleted', resolve));
  assert.equal((await api('DELETE', `/workspaces/${workspaceId}`, 'alice')).status, 204);
  await deleted;
  assert.equal(collab.sessions.has(workspaceId), false);
  assert.equal(await prisma.workspace.findUnique({ where: { id: workspaceId } }), null);
});

test('load: two editors typing while 25 viewers watch - everyone ends up identical', async () => {
  const { workspaceId } = await setup('VIEW_ONLY');
  const tab1 = await open('alice', workspaceId);
  const tab2 = await open('alice', workspaceId); // owner with a second browser tab
  const viewers = [];
  for (let i = 0; i < 25; i++) viewers.push(await open('bob', workspaceId));

  const started = Date.now();
  for (let i = 0; i < 200; i++) {
    insert(tab1.client, tab1.text.length, 'a');
    insert(tab2.client, 0, 'b');
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 5)); // typing is not instantaneous
  }
  await waitFor(
    () => [tab1, tab2, ...viewers].every((p) => p.text.length === 400 && p.text.toString() === tab1.text.toString()),
    { timeout: 8000, label: '27 documents identical' }
  );
  assert.ok(Date.now() - started < 5000, `converged in ${Date.now() - started} ms`);
  assert.equal(collab.sessions.get(workspaceId).text.toString(), tab1.text.toString());

  await waitFor(() => tab1.client.presence.find((u) => u.username === 'bob')?.connections === 25, { label: '25 bob connections counted once' });
  assert.equal(tab1.client.presence.length, 2, 'two people, however many tabs');
});
