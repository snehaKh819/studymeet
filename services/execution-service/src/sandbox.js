import { LANGUAGES } from './languages.js';
import { FrameParser } from './frames.js';

export const LABEL = 'studymeet.execution';

export const DEFAULT_LIMITS = {
  timeoutMs: 10_000, // wall-clock time before the container is killed
  memoryBytes: 128 * 1024 * 1024, // RAM (swap disabled)
  nanoCpus: 500_000_000, // 0.5 CPU
  pids: 64, // processes/threads (stops fork bombs)
  tmpfs: 'rw,noexec,nosuid,nodev,size=16m,mode=1777', // the only writable place
  maxOutputBytes: 64 * 1024, // stdout + stderr combined
  maxCodeBytes: 90_000,
  maxStdinBytes: 10_000,
};

export class RunnerError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'runtime_not_ready' | 'docker_error'
  }
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The exact container configuration. Kept as a pure function so tests can assert
// every hardening flag is present.
export function buildContainerSpec({ language, code, stdin = '' }, limits = DEFAULT_LIMITS) {
  const lang = LANGUAGES[language];
  return {
    Image: lang.image,
    // Code and stdin arrive base64-encoded in env vars, so nothing is ever written
    // to a shared disk and no shell quoting of user content is involved.
    Cmd: [
      'sh',
      '-c',
      `echo "$CODE_B64" | base64 -d > /tmp/${lang.file} && echo "$STDIN_B64" | base64 -d | ${lang.command}`,
    ],
    Env: [`CODE_B64=${b64(code)}`, `STDIN_B64=${b64(stdin)}`, 'HOME=/tmp', ...lang.env],
    User: '65534:65534', // nobody
    WorkingDir: '/tmp',
    NetworkDisabled: true,
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    Labels: { [LABEL]: 'true' },
    HostConfig: {
      NetworkMode: 'none',
      Memory: limits.memoryBytes,
      MemorySwap: limits.memoryBytes,
      NanoCpus: limits.nanoCpus,
      PidsLimit: limits.pids,
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      AutoRemove: false,
      Tmpfs: { '/tmp': limits.tmpfs },
      Ulimits: [
        { Name: 'nofile', Soft: 256, Hard: 256 },
        { Name: 'fsize', Soft: 10 * 1024 * 1024, Hard: 10 * 1024 * 1024 },
        { Name: 'core', Soft: 0, Hard: 0 },
      ],
    },
  };
}

// Runs one job in a throw-away container and always removes it afterwards.
export async function runInSandbox(docker, job, limits = DEFAULT_LIMITS) {
  const created = await docker.request('POST', '/containers/create', buildContainerSpec(job, limits));
  if (created.status === 404) throw new RunnerError('The runtime image is not available yet', 'runtime_not_ready');
  if (created.status !== 201) throw new RunnerError(`Could not create sandbox (HTTP ${created.status})`, 'docker_error');
  const id = created.body.Id;

  try {
    const started = await docker.request('POST', `/containers/${id}/start`);
    if (started.status !== 204) throw new RunnerError(`Could not start sandbox (HTTP ${started.status})`, 'docker_error');
    const startedAt = Date.now();

    let timedOut = false;
    let truncated = false;
    let total = 0;
    const out = [];
    const err = [];
    const kill = () => docker.request('POST', `/containers/${id}/kill`).catch(() => {});

    // Collect output (capped) while the container runs.
    const logsDone = (async () => {
      const res = await docker.open('GET', `/containers/${id}/logs?stdout=1&stderr=1&follow=1`);
      const parser = new FrameParser((type, payload) => {
        if (truncated) return;
        const room = limits.maxOutputBytes - total;
        const part = payload.length > room ? payload.subarray(0, room) : payload;
        (type === 2 ? err : out).push(Buffer.from(part));
        total += part.length;
        if (payload.length > room) {
          truncated = true;
          kill(); // runaway output: stop the program
        }
      });
      for await (const chunk of res) {
        parser.push(chunk);
        if (truncated) break;
      }
    })().catch(() => {});

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, limits.timeoutMs);

    // Hard deadline in case Docker itself misbehaves.
    const waited = await Promise.race([
      docker.request('POST', `/containers/${id}/wait?condition=not-running`),
      sleep(limits.timeoutMs + 10_000).then(() => {
        timedOut = true;
        return null;
      }),
    ]);
    clearTimeout(timer);
    await Promise.race([logsDone, sleep(2000)]);

    const info = await docker.request('GET', `/containers/${id}/json`).catch(() => null);
    const state = info?.body?.State ?? {};

    return {
      stdout: Buffer.concat(out).toString('utf8'),
      stderr: Buffer.concat(err).toString('utf8'),
      exitCode: waited?.body?.StatusCode ?? state.ExitCode ?? null,
      timedOut,
      oomKilled: Boolean(state.OOMKilled),
      truncated,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await docker.request('DELETE', `/containers/${id}?force=true&v=true`).catch(() => {});
  }
}
