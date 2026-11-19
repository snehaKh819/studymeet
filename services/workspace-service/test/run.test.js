// Tests for POST /workspaces/:id/run against a stubbed execution-service.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-secret';

const roomId = randomUUID();
const users = {
  alice: { userId: randomUUID(), username: 'alice' },
  bob: { userId: randomUUID(), username: 'bob' },
  carol: { userId: randomUUID(), username: 'carol' },
};
const tokens = Object.fromEntries(
  Object.entries(users).map(([k, u]) => [k, jwt.sign({ userId: u.userId, email: `${k}@t.dev`, username: u.username }, process.env.JWT_SECRET)])
);

let server, authStub, execStub, base, redis, prisma, deriveInternalToken, wsId;
const execCalls = [];
let execBehaviour = { status: 200, delayMs: 0 };

before(async () => {
  authStub = http.createServer((req, res) => {
    res.statusCode = req.url === `/rooms/${roomId}` ? 200 : 404;
    res.end('{}');
  });
  await new Promise((r) => authStub.listen(0, '127.0.0.1', r));
  process.env.USER_AUTH_URL = `http://127.0.0.1:${authStub.address().port}`;

  execStub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      execCalls.push({ token: req.headers['x-internal-token'], body: JSON.parse(raw) });
      setTimeout(() => {
        res.writeHead(execBehaviour.status, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(
            execBehaviour.status === 200
              ? { language: 'python', stdout: 'hello\n', stderr: '', exitCode: 0, timedOut: false, oomKilled: false, truncated: false, durationMs: 42, internal: 'must-not-leak' }
              : { message: execBehaviour.message ?? 'boom' }
          )
        );
      }, execBehaviour.delayMs);
    });
  });
  await new Promise((r) => execStub.listen(0, '127.0.0.1', r));
  process.env.EXECUTION_URL = `http://127.0.0.1:${execStub.address().port}`;

  ({ default: redis } = await import('../src/lib/redis.js'));
  ({ default: prisma } = await import('../src/lib/prisma.js'));
  ({ deriveInternalToken } = await import('../src/lib/internalToken.js'));
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  await redis.hset(`room:${roomId}:members`, users.alice.userId, 'alice', users.bob.userId, 'bob');
  const created = await call('POST', '/workspaces', 'alice', { roomId });
  wsId = created.body.workspace.id;
});

after(async () => {
  await prisma.workspace.deleteMany({ where: { roomId } });
  await redis.del(`room:${roomId}:members`);
  for (const u of Object.values(users)) await redis.del(`run:lock:${u.userId}`);
  await prisma.$disconnect();
  await redis.quit();
  server.close();
  authStub.close();
  execStub.close();
});

async function call(method, path, who, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const clearRateLimit = async (u) => {
  const minute = Math.floor(Date.now() / 60_000);
  await redis.del(`run:count:${users[u].userId}:${minute}`, `run:count:${users[u].userId}:${minute - 1}`);
};

test('nothing to run -> 400, and the runner is not called', async () => {
  const r = await call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  assert.equal(r.status, 400);
  assert.equal(execCalls.length, 0);
});

test('owner runs saved code: authenticated call to the runner, result passed through, extra fields dropped', async () => {
  await call('PUT', `/workspaces/${wsId}/code`, 'alice', { code: 'print("hello")' });
  const r = await call('POST', `/workspaces/${wsId}/run`, 'alice', { stdin: 'in' });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.result).sort(), ['durationMs', 'exitCode', 'oomKilled', 'stderr', 'stdout', 'timedOut', 'truncated']);
  assert.equal(r.body.result.stdout, 'hello\n');
  const sent = execCalls.at(-1);
  assert.equal(sent.token, deriveInternalToken(process.env.JWT_SECRET));
  assert.deepEqual(sent.body, { language: 'python', code: 'print("hello")', stdin: 'in' });
});

test('run with { code } saves it first', async () => {
  const r = await call('POST', `/workspaces/${wsId}/run`, 'alice', { code: 'print("new")' });
  assert.equal(r.status, 200);
  assert.equal(execCalls.at(-1).body.code, 'print("new")');
  assert.equal((await call('GET', `/workspaces/${wsId}`, 'alice')).body.workspace.code, 'print("new")');
});

test('viewers cannot run; people outside the room cannot even see it', async () => {
  const before = execCalls.length;
  await call('PATCH', `/workspaces/${wsId}`, 'alice', { sharingMode: 'VIEW_ONLY' });
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'bob', {})).status, 403);
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'carol', {})).status, 404);
  await call('PATCH', `/workspaces/${wsId}`, 'alice', { sharingMode: 'COLLABORATIVE' });
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'bob', {})).status, 403, 'member without an edit grant');
  assert.equal(execCalls.length, before, 'runner never called');
});

test('granted editor can run', async () => {
  await call('PUT', `/workspaces/${wsId}/editors/${users.bob.userId}`, 'alice');
  const r = await call('POST', `/workspaces/${wsId}/run`, 'bob', {});
  assert.equal(r.status, 200);
});

test('validation of run input', async () => {
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'alice', { stdin: 5 })).status, 400);
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'alice', { code: 5 })).status, 400);
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'alice', { code: 'a'.repeat(200_001) })).status, 413);
});

test('a second run by the same user while one is in flight is rejected', async () => {
  await clearRateLimit('alice');
  execBehaviour = { status: 200, delayMs: 400 };
  const first = call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  await new Promise((r) => setTimeout(r, 100));
  const second = await call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  assert.equal(second.status, 429);
  assert.equal((await first).status, 200);
  execBehaviour = { status: 200, delayMs: 0 };
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'alice', {})).status, 200, 'lock released afterwards');
});

test('runner errors: user-facing ones pass through, internal ones are hidden', async () => {
  await clearRateLimit('alice');
  execBehaviour = { status: 503, message: 'The python runtime is still being prepared.' };
  let r = await call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  assert.equal(r.status, 503);
  assert.match(r.body.message, /still being prepared/);
  execBehaviour = { status: 500, message: 'secret stack trace' };
  r = await call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  assert.equal(r.status, 502);
  assert.doesNotMatch(JSON.stringify(r.body), /secret/);
  execBehaviour = { status: 200, delayMs: 0 };
});

test('runner unreachable -> 503, and the lock is released', async () => {
  await clearRateLimit('alice');
  const saved = process.env.EXECUTION_URL;
  process.env.EXECUTION_URL = 'http://127.0.0.1:1';
  const r = await call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  process.env.EXECUTION_URL = saved;
  assert.equal(r.status, 503);
  assert.equal((await call('POST', `/workspaces/${wsId}/run`, 'alice', {})).status, 200);
});

test('per-minute rate limit', async () => {
  await clearRateLimit('alice');
  let last;
  for (let i = 0; i < 21; i++) last = await call('POST', `/workspaces/${wsId}/run`, 'alice', {});
  assert.equal(last.status, 429);
  assert.match(last.body.message, /Too many runs/);
});
