import { createApp } from './app.js';
import { DockerClient } from './docker.js';
import { DEFAULT_LIMITS, runInSandbox } from './sandbox.js';
import { Semaphore } from './semaphore.js';
import { createImageManager } from './images.js';
import { startJanitor } from './janitor.js';
import { deriveInternalToken } from './internalAuth.js';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set');
  process.exit(1);
}

const limits = {
  ...DEFAULT_LIMITS,
  timeoutMs: Number(process.env.EXEC_TIMEOUT_MS || DEFAULT_LIMITS.timeoutMs),
};
const docker = DockerClient.fromEnv();
const images = createImageManager(docker);
const semaphore = new Semaphore(Number(process.env.MAX_CONCURRENT_RUNS || 2), Number(process.env.MAX_QUEUED_RUNS || 8));

const server = createApp({
  docker,
  run: (job) => runInSandbox(docker, job, limits),
  semaphore,
  imageState: images.state,
  internalToken: deriveInternalToken(process.env.JWT_SECRET),
  limits,
});

const PORT = process.env.PORT || 5005;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Execution service listening on port ${PORT}`);
  images.start();
  startJanitor(docker, { maxAgeMs: limits.timeoutMs + 30_000 });
});
