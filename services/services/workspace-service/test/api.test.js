// Integration tests: need a running Postgres (DATABASE_URL, migrated) and Redis (REDIS_HOST).
//   JWT_SECRET=test DATABASE_URL=... REDIS_HOST=127.0.0.1 npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-secret';

const roomId = randomUUID();
const users = {
  alice: { userId: randomUUID(), username: 'alice' }, // owner
  bob: { userId: randomUUID(), username: 'bob' }, // room member
  carol: { userId: randomUUID(), username: 'carol' }, // never joined the room
};
const tokenFor = (u) =>
  jwt.sign({ userId: u.userId, email: `${u.username}@test.dev`, username: u.username }, process.env.JWT_SECRET);
const tokens = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, tokenFor(u)]));

let server, userAuthStub, base, redis, prisma, workspaceId;

before(async () => {
  // Stub of user-auth's GET /rooms/:id (only `roomId` exists).
  userAuthStub = http.createServer((req, res) => {
    const ok = req.url === `/rooms/${roomId}` && req.headers.authorization?.startsWith('Bearer ');
    res.statusCode = ok ? 200 : 404;
    res.end('{}');
  });
  await new Promise((r) => userAuthStub.listen(0, '127.0.0.1', r));
  process.env.USER_AUTH_URL = `http://127.0.0.1:${userAuthStub.address().port}`;

  ({ default: redis } = await import('../src/lib/redis.js'));
  ({ default: prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // room-service would do this when each user joins.
  await redis.hset(`room:${roomId}:members`, users.alice.userId, 'alice', users.bob.userId, 'bob');
});

after(async () => {
  await prisma.workspace.deleteMany({ where: { roomId } });
  await redis.del(`room:${roomId}:members`);
  await prisma.$disconnect();
  await redis.quit();
  server.close();
  userAuthStub.close();
});

async function call(method, path, who, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('rejects requests without a valid token', async () => {
  assert.equal((await call('GET', `/workspaces?roomId=${roomId}`)).status, 401);
  const bad = await fetch(`${base}/workspaces?roomId=${roomId}`, { headers: { Authorization: 'Bearer nope' } });
  assert.equal(bad.status, 401);
});

test('health reports database and redis', async () => {
  const res = await call('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
  assert.equal(res.body.redis, 'connected');
});

test('only users who joined the room can create a workspace', async () => {
  assert.equal((await call('POST', '/workspaces', 'carol', { roomId })).status, 403);
});

test('creating for a room that does not exist is a 404', async () => {
  const ghost = randomUUID();
  await redis.hset(`room:${ghost}:members`, users.alice.userId, 'alice');
  try {
    assert.equal((await call('POST', '/workspaces', 'alice', { roomId: ghost })).status, 404);
  } finally {
    await redis.del(`room:${ghost}:members`);
  }
});

test('create is idempotent: one personal workspace per user per room', async () => {
  const first = await call('POST', '/workspaces', 'alice', { roomId, name: 'My code', language: 'javascript' });
  assert.equal(first.status, 201);
  assert.equal(first.body.workspace.sharingMode, 'PRIVATE');
  assert.equal(first.body.workspace.language, 'javascript');
  assert.equal(first.body.workspace.permissions.isOwner, true);
  workspaceId = first.body.workspace.id;

  const again = await call('POST', '/workspaces', 'alice', { roomId });
  assert.equal(again.status, 200);
  assert.equal(again.body.workspace.id, workspaceId);
});

test('validation', async () => {
  assert.equal((await call('POST', '/workspaces', 'alice', { roomId: 'not-a-uuid' })).status, 400);
  assert.equal((await call('POST', '/workspaces', 'bob', { roomId, language: 'cobol' })).status, 400);
  assert.equal((await call('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode: 'PUBLIC' })).status, 400);
  assert.equal((await call('PATCH', `/workspaces/${workspaceId}`, 'alice', { name: 'x'.repeat(61) })).status, 400);
  assert.equal((await call('PATCH', `/workspaces/${workspaceId}`, 'alice', {})).status, 400);
  assert.equal((await call('GET', '/workspaces/not-a-uuid', 'alice')).status, 404);
});

test('PRIVATE: invisible to everyone else', async () => {
  assert.equal((await call('GET', `/workspaces/${workspaceId}`, 'bob')).status, 404);
  const list = await call('GET', `/workspaces?roomId=${roomId}`, 'bob');
  assert.equal(list.status, 200);
  assert.equal(list.body.workspaces.length, 0);
});

test('VIEW_ONLY: room members can read but not edit, rename or share', async () => {
  const patched = await call('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode: 'VIEW_ONLY' });
  assert.equal(patched.status, 200);
  await call('PUT', `/workspaces/${workspaceId}/code`, 'alice', { code: 'console.log(1)' });

  const read = await call('GET', `/workspaces/${workspaceId}`, 'bob');
  assert.equal(read.status, 200);
  assert.equal(read.body.workspace.code, 'console.log(1)');
  assert.deepEqual(
    [read.body.workspace.permissions.canView, read.body.workspace.permissions.canEdit, read.body.workspace.permissions.canRun],
    [true, false, false]
  );

  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'bob', { code: 'hack' })).status, 403);
  assert.equal((await call('PATCH', `/workspaces/${workspaceId}`, 'bob', { name: 'mine now' })).status, 403);
  assert.equal((await call('DELETE', `/workspaces/${workspaceId}`, 'bob')).status, 403);
  assert.equal((await call('GET', `/workspaces/${workspaceId}/editors`, 'bob')).status, 403);

  // someone who never joined the room still can't see it
  assert.equal((await call('GET', `/workspaces/${workspaceId}`, 'carol')).status, 404);
  assert.equal((await call('GET', `/workspaces?roomId=${roomId}`, 'carol')).status, 403);

  const list = await call('GET', `/workspaces?roomId=${roomId}`, 'bob');
  assert.equal(list.body.workspaces.length, 1);
  assert.equal(list.body.workspaces[0].ownerName, 'alice');
  assert.equal('code' in list.body.workspaces[0], false, 'list must not include code');
});

test('COLLABORATIVE: only granted editors can edit; revoking takes it away', async () => {
  await call('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode: 'COLLABORATIVE' });

  // not granted yet
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'bob', { code: 'x' })).status, 403);

  // can only grant people who are in the room, and not the owner
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/editors/${users.carol.userId}`, 'alice')).status, 400);
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/editors/${users.alice.userId}`, 'alice')).status, 400);
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/editors/nope`, 'alice')).status, 400);

  const granted = await call('PUT', `/workspaces/${workspaceId}/editors/${users.bob.userId}`, 'alice');
  assert.equal(granted.status, 200);
  assert.deepEqual(granted.body.editors, [{ userId: users.bob.userId, username: 'bob' }]);

  const bobView = await call('GET', `/workspaces/${workspaceId}`, 'bob');
  assert.equal(bobView.body.workspace.permissions.canEdit, true);
  assert.equal(bobView.body.workspace.permissions.canRun, true);
  assert.equal(bobView.body.workspace.permissions.isOwner, false);

  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'bob', { code: 'print("from bob")' })).status, 200);
  assert.equal((await call('GET', `/workspaces/${workspaceId}`, 'alice')).body.workspace.code, 'print("from bob")');

  // an edit grant is meaningless once the owner drops back to VIEW_ONLY
  await call('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode: 'VIEW_ONLY' });
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'bob', { code: 'y' })).status, 403);
  await call('PATCH', `/workspaces/${workspaceId}`, 'alice', { sharingMode: 'COLLABORATIVE' });

  assert.equal((await call('DELETE', `/workspaces/${workspaceId}/editors/${users.bob.userId}`, 'alice')).status, 204);
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'bob', { code: 'z' })).status, 403);
});

test('code size and type limits', async () => {
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'alice', { code: 123 })).status, 400);
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'alice', { code: 'a'.repeat(200_001) })).status, 413);
  assert.equal((await call('PUT', `/workspaces/${workspaceId}/code`, 'alice', { code: 'a'.repeat(200_000) })).status, 200);
});

test('participants list for the share picker', async () => {
  const res = await call('GET', `/workspaces/participants?roomId=${roomId}`, 'alice');
  assert.equal(res.status, 200);
  const names = res.body.participants.map((p) => p.username).sort();
  assert.deepEqual(names, ['alice', 'bob']);
  assert.equal(res.body.participants.find((p) => p.username === 'alice').isMe, true);
  assert.equal((await call('GET', `/workspaces/participants?roomId=${roomId}`, 'carol')).status, 403);
});

test('only the owner can delete; afterwards it is gone', async () => {
  assert.equal((await call('DELETE', `/workspaces/${workspaceId}`, 'bob')).status, 403);
  assert.equal((await call('DELETE', `/workspaces/${workspaceId}`, 'alice')).status, 204);
  assert.equal((await call('GET', `/workspaces/${workspaceId}`, 'alice')).status, 404);
});
