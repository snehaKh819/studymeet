import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { Semaphore } from '../src/semaphore.js';
import { deriveInternalToken, tokenMatches } from '../src/internalAuth.js';
import { DEFAULT_LIMITS } from '../src/sandbox.js';

const token = deriveInternalToken('test-secret');
const imageState = { python: 'ready', javascript: 'pulling' };
let calls = 0;
let gate = null; // when set, runs block until gate() is called
let server, base;

before(async () => {
  const run = async (job) => {
    calls += 1;
    if (gate) await new Promise((r) => (gate = r));
    return { stdout: `ran ${job.language}`, stderr: '', exitCode: 0, timedOut: false, oomKilled: false, truncated: false, durationMs: 5 };
  };
  server = createApp({
    docker: { ping: async () => true },
    run,
    semaphore: new Semaphore(1, 1),
    imageState,
    internalToken: token,
    limits: DEFAULT_LIMITS,
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (body, headers = { 'x-internal-token': token }) =>
  fetch(`${base}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('token derivation is stable and compared safely', () => {
  assert.equal(deriveInternalToken('a'), deriveInternalToken('a'));
  assert.notEqual(deriveInternalToken('a'), deriveInternalToken('b'));
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches(token, 'nope'), false);
  assert.equal(tokenMatches(token, undefined), false);
});

test('health', async () => {
  const body = await (await fetch(`${base}/health`)).json();
  assert.equal(body.status, 'healthy');
  assert.deepEqual(body.runtimes, imageState);
});

test('requires the internal token', async () => {
  assert.equal((await post({ language: 'python', code: 'x' }, {})).status, 401);
  assert.equal((await post({ language: 'python', code: 'x' }, { 'x-internal-token': 'wrong' })).status, 401);
  assert.equal(calls, 0);
});

test('validation', async () => {
  assert.equal((await post({ language: 'cobol', code: 'x' })).status, 400);
  assert.equal((await post({ language: 'python', code: '   ' })).status, 400);
  assert.equal((await post({ language: 'python', code: 5 })).status, 400);
  assert.equal((await post({ language: 'python', code: 'x', stdin: 5 })).status, 400);
  assert.equal((await post({ language: 'python', code: 'x'.repeat(90_001) })).status, 413);
  assert.equal((await post({ language: 'python', code: 'x', stdin: 'y'.repeat(10_001) })).status, 413);
  assert.equal((await post({ language: 'javascript', code: 'x' })).status, 503, 'runtime still downloading');
  assert.equal(calls, 0);
});

test('successful run returns the result', async () => {
  const res = await post({ language: 'python', code: 'print(1)' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.stdout, 'ran python');
  assert.equal(body.exitCode, 0);
});

test('concurrency: one running + one queued, the next is turned away with 429', async () => {
  gate = true; // make runs block
  const first = post({ language: 'python', code: 'a' }); // takes the only slot
  await new Promise((r) => setTimeout(r, 100));
  const second = post({ language: 'python', code: 'b' }); // queued
  await new Promise((r) => setTimeout(r, 100));
  const third = await post({ language: 'python', code: 'c' }); // queue full
  assert.equal(third.status, 429);
  const release = gate;
  gate = null;
  release(); // let the first finish; the queued one then runs unblocked
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
});
