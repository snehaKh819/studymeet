// End-to-end check of the REAL sandbox against the REAL Docker daemon.
// Run it inside the container (it needs the Docker socket):
//   docker compose exec execution-service node scripts/smoke.js
import { DockerClient } from '../src/docker.js';
import { DEFAULT_LIMITS, LABEL, runInSandbox } from '../src/sandbox.js';
import { createImageManager } from '../src/images.js';

const docker = DockerClient.fromEnv();
const limits = { ...DEFAULT_LIMITS, timeoutMs: 4000 };
const run = (language, code, stdin = '') => runInSandbox(docker, { language, code, stdin }, limits);

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    const problem = await fn();
    results.push({ name, ok: !problem });
    console.log(`${problem ? 'FAIL' : 'PASS'}  ${name} (${Date.now() - started} ms)${problem ? `\n      -> ${problem}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      -> threw: ${err.message}`);
  }
}

if (!(await docker.ping().catch(() => false))) {
  console.error('Cannot reach the Docker daemon. Is /var/run/docker.sock mounted into this container?');
  process.exit(2);
}

console.log('Preparing runtime images (the first run downloads python:3.12-alpine, this can take a minute)...');
const images = createImageManager(docker);
await images.refresh();
if (Object.values(images.state).some((s) => s !== 'ready')) {
  console.error('Runtime images are not ready:', images.state);
  process.exit(2);
}
console.log('');

await check('python: hello world', async () => {
  const r = await run('python', 'print("hello")');
  return r.stdout === 'hello\n' && r.exitCode === 0 ? null : JSON.stringify(r);
});
await check('javascript: hello world', async () => {
  const r = await run('javascript', 'console.log("hi from node")');
  return r.stdout === 'hi from node\n' && r.exitCode === 0 ? null : JSON.stringify(r);
});
await check('python: stdin / input() works', async () => {
  const r = await run('python', 'print(input()[::-1])', 'abc');
  return r.stdout === 'cba\n' ? null : JSON.stringify(r);
});
await check('python: syntax error -> non-zero exit + message', async () => {
  const r = await run('python', 'print(');
  return r.exitCode !== 0 && /SyntaxError/.test(r.stderr) ? null : JSON.stringify(r);
});
await check('python: runs as non-root (uid 65534)', async () => {
  const r = await run('python', 'import os; print(os.getuid())');
  return r.stdout.trim() === '65534' ? null : JSON.stringify(r);
});
await check('python: host secrets are not visible', async () => {
  const r = await run('python', 'import os; print("JWT_SECRET" in os.environ, "CODE_B64" in os.environ)');
  return /False/.test(r.stdout) && !/JWT_SECRET.*True/.test(r.stdout) ? null : r.stdout;
});
await check('python: infinite loop is killed at the timeout', async () => {
  const r = await run('python', 'while True: pass');
  return r.timedOut && r.durationMs < 9000 ? null : JSON.stringify(r);
});
await check('python: memory bomb is stopped', async () => {
  const r = await run('python', 'x = bytearray(1024**3)\nprint("allocated")');
  return !/allocated/.test(r.stdout) && (r.oomKilled || r.exitCode !== 0) ? null : JSON.stringify(r);
});
await check('python: network is blocked', async () => {
  const code = 'import socket\ns = socket.socket()\ns.settimeout(2)\ntry:\n    s.connect(("1.1.1.1", 80))\n    print("CONNECTED")\nexcept Exception as e:\n    print("blocked")';
  const r = await run('python', code);
  return r.stdout.trim() === 'blocked' ? null : JSON.stringify(r);
});
await check('python: fork bomb is contained by the process limit', async () => {
  const code = 'import os\nn = 0\ntry:\n    while n < 500:\n        if os.fork() == 0:\n            import time; time.sleep(5); os._exit(0)\n        n += 1\nexcept OSError:\n    pass\nprint("forks", n)';
  const r = await run('python', code);
  const n = Number((r.stdout.match(/forks (\d+)/) || [])[1]);
  return n > 0 && n < 100 ? null : JSON.stringify(r);
});
await check('python: filesystem is read-only except /tmp', async () => {
  const code = 'try:\n    open("/etc/evil", "w")\n    print("WROTE")\nexcept OSError:\n    print("readonly")\nopen("/tmp/ok", "w").write("x")\nprint("tmp-ok")';
  const r = await run('python', code);
  return r.stdout === 'readonly\ntmp-ok\n' ? null : JSON.stringify(r);
});
await check('python: huge output is truncated and stopped', async () => {
  const r = await run('python', 'while True: print("x" * 1000)');
  return r.truncated && r.stdout.length <= limits.maxOutputBytes ? null : `truncated=${r.truncated} len=${r.stdout.length}`;
});
await check('javascript: infinite loop is killed at the timeout', async () => {
  const r = await run('javascript', 'while (true) {}');
  return r.timedOut ? null : JSON.stringify(r);
});
await check('no sandbox containers are left behind', async () => {
  const filters = encodeURIComponent(JSON.stringify({ label: [`${LABEL}=true`] }));
  const res = await docker.request('GET', `/containers/json?all=1&filters=${filters}`);
  return res.body.length === 0 ? null : `${res.body.length} container(s) still exist`;
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
