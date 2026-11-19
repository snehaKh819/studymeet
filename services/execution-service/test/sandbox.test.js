import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../src/docker.js';
import { buildContainerSpec, runInSandbox, DEFAULT_LIMITS, RunnerError } from '../src/sandbox.js';
import { FrameParser } from '../src/frames.js';
import { createImageManager } from '../src/images.js';
import { startFakeEngine } from '../testing/fakeEngine.js';

const fast = { ...DEFAULT_LIMITS, timeoutMs: 400 };

async function withEngine(scenario, fn) {
  const engine = await startFakeEngine(scenario);
  try {
    await fn(new DockerClient({ socketPath: engine.socketPath }), engine);
  } finally {
    await engine.close();
  }
}

test('container spec carries every hardening flag', () => {
  const spec = buildContainerSpec({ language: 'python', code: 'print(1)', stdin: 'x' });
  const hc = spec.HostConfig;
  assert.equal(spec.User, '65534:65534', 'runs as nobody');
  assert.equal(spec.NetworkDisabled, true);
  assert.equal(hc.NetworkMode, 'none');
  assert.equal(hc.ReadonlyRootfs, true);
  assert.deepEqual(hc.CapDrop, ['ALL']);
  assert.deepEqual(hc.SecurityOpt, ['no-new-privileges']);
  assert.equal(hc.Privileged, false);
  assert.equal(hc.Memory, 128 * 1024 * 1024);
  assert.equal(hc.MemorySwap, hc.Memory, 'swap disabled');
  assert.equal(hc.NanoCpus, 500_000_000);
  assert.equal(hc.PidsLimit, 64);
  assert.match(hc.Tmpfs['/tmp'], /noexec/);
  assert.ok(hc.Ulimits.some((u) => u.Name === 'fsize'));
  assert.equal(spec.Labels['studymeet.execution'], 'true');
  assert.equal(spec.Image, 'python:3.12-alpine');
  // code is passed as base64, never interpolated into the shell command
  assert.ok(!spec.Cmd.join(' ').includes('print(1)'));
  assert.equal(Buffer.from(spec.Env[0].split('=')[1], 'base64').toString(), 'print(1)');
  assert.equal(buildContainerSpec({ language: 'javascript', code: 'x' }).Image, 'node:20-alpine');
});

test('malicious-looking code cannot break out of the encoding', () => {
  const evil = `"; rm -rf / ; echo '$(whoami)' \`id\` \n EOF`;
  const spec = buildContainerSpec({ language: 'python', code: evil });
  assert.ok(!spec.Cmd[2].includes('rm -rf'));
  assert.equal(Buffer.from(spec.Env[0].slice('CODE_B64='.length), 'base64').toString(), evil);
});

test('frame parser handles frames split across chunks', () => {
  const got = [];
  const p = new FrameParser((t, b) => got.push([t, b.toString()]));
  const header = Buffer.from([1, 0, 0, 0, 0, 0, 0, 5]);
  p.push(header.subarray(0, 3));
  p.push(Buffer.concat([header.subarray(3), Buffer.from('he')]));
  p.push(Buffer.concat([Buffer.from('llo'), Buffer.from([2, 0, 0, 0, 0, 0, 0, 1]), Buffer.from('!')]));
  assert.deepEqual(got, [[1, 'hello'], [2, '!']]);
});

test('normal run: demultiplexes stdout/stderr, exit 0, container removed', async () => {
  await withEngine({ output: [[1, 'hello\n'], [2, 'warn\n']], exitCode: 0 }, async (docker, engine) => {
    const r = await runInSandbox(docker, { language: 'python', code: 'print("hello")' }, fast);
    assert.equal(r.stdout, 'hello\n');
    assert.equal(r.stderr, 'warn\n');
    assert.equal(r.exitCode, 0);
    assert.equal(r.timedOut, false);
    assert.equal(r.truncated, false);
    assert.equal(r.oomKilled, false);
    assert.deepEqual(engine.requests.filter((q) => q.includes('/containers/')).map((q) => q.replace('/abc123', '')), [
      'POST /containers/create',
      'POST /containers/start',
      'GET /containers/logs',
      'POST /containers/wait',
      'GET /containers/json',
      'DELETE /containers',
    ]);
    assert.equal(engine.bodies['POST /containers/create'].HostConfig.NetworkMode, 'none');
  });
});

test('failing program: non-zero exit code and stderr are returned', async () => {
  await withEngine({ output: [[2, 'Traceback...\n']], exitCode: 1 }, async (docker) => {
    const r = await runInSandbox(docker, { language: 'python', code: 'raise Exception' }, fast);
    assert.equal(r.exitCode, 1);
    assert.equal(r.stderr, 'Traceback...\n');
  });
});

test('infinite loop: killed at the timeout, flagged, and cleaned up', async () => {
  await withEngine({ hang: true }, async (docker, engine) => {
    const started = Date.now();
    const r = await runInSandbox(docker, { language: 'python', code: 'while True: pass' }, fast);
    assert.equal(r.timedOut, true);
    assert.equal(r.exitCode, 137);
    assert.ok(Date.now() - started < 3000, 'did not hang');
    assert.ok(engine.requests.includes('POST /containers/abc123/kill'));
    assert.ok(engine.requests.includes('DELETE /containers/abc123'));
  });
});

test('runaway output: truncated at the cap and the program is killed', async () => {
  await withEngine({ flood: true }, async (docker, engine) => {
    const r = await runInSandbox(docker, { language: 'python', code: 'while True: print("x"*9999)' }, { ...fast, timeoutMs: 5000 });
    assert.equal(r.truncated, true);
    assert.equal(r.stdout.length, DEFAULT_LIMITS.maxOutputBytes);
    assert.equal(r.timedOut, false, 'stopped by the output cap, not the timer');
    assert.ok(engine.requests.includes('POST /containers/abc123/kill'));
  });
});

test('out of memory is reported', async () => {
  await withEngine({ exitCode: 137, oom: true }, async (docker) => {
    const r = await runInSandbox(docker, { language: 'python', code: 'x = "a" * 10**10' }, fast);
    assert.equal(r.oomKilled, true);
    assert.equal(r.exitCode, 137);
  });
});

test('missing runtime image becomes a clear error (and nothing is left behind)', async () => {
  await withEngine({ noImage: true }, async (docker, engine) => {
    await assert.rejects(
      runInSandbox(docker, { language: 'python', code: 'print(1)' }, fast),
      (err) => err instanceof RunnerError && err.code === 'runtime_not_ready'
    );
    assert.ok(!engine.requests.some((q) => q.startsWith('DELETE')));
  });
});

test('ping works against the engine', async () => {
  await withEngine({}, async (docker) => assert.equal(await docker.ping(), true));
});

test('docker down surfaces as DockerUnavailableError', async () => {
  const docker = new DockerClient({ socketPath: '/nonexistent/docker.sock' });
  await assert.rejects(runInSandbox(docker, { language: 'python', code: 'x' }, fast), /Docker unreachable/);
  assert.equal(await docker.ping().catch(() => false), false);
});

test('image manager: ready when present, pulls when missing', async () => {
  await withEngine({}, async (docker) => {
    const m = createImageManager(docker, { python: { image: 'python:3.12-alpine' } }, { log() {}, error() {} });
    await m.refresh();
    assert.equal(m.state.python, 'ready');
  });
  await withEngine({ imageMissing: true }, async (docker, engine) => {
    const m = createImageManager(docker, { python: { image: 'python:3.12-alpine' } }, { log() {}, error() {} });
    await m.refresh();
    assert.ok(engine.requests.includes('POST /images/create'), 'tried to pull');
    assert.equal(m.state.python, 'error', 'fake engine never gets the image, so it must not claim ready');
  });
});
