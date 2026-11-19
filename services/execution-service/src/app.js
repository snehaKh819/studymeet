import http from 'node:http';
import { tokenMatches } from './internalAuth.js';
import { LANGUAGES } from './languages.js';
import { QueueFullError } from './semaphore.js';
import { DockerUnavailableError } from './docker.js';
import { RunnerError } from './sandbox.js';

const MAX_BODY_BYTES = 300_000;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
};

/**
 * deps: { docker, run(job), semaphore, imageState, internalToken, limits }
 * `run` is injected so tests can fake the sandbox.
 */
export function createApp({ docker, run, semaphore, imageState, internalToken, limits }) {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');

      if (req.method === 'GET' && pathname === '/health') {
        let dockerUp = false;
        try {
          dockerUp = await docker.ping();
        } catch {
          /* unreachable */
        }
        return send(res, dockerUp ? 200 : 500, {
          status: dockerUp ? 'healthy' : 'unhealthy',
          service: 'execution-service',
          docker: dockerUp ? 'connected' : 'down',
          runtimes: imageState,
        });
      }

      if (req.method === 'POST' && pathname === '/execute') {
        if (!tokenMatches(internalToken, req.headers['x-internal-token'])) {
          return send(res, 401, { message: 'Unauthorized' });
        }

        const { language, code, stdin } = await readJson(req);
        if (!Object.hasOwn(LANGUAGES, language)) {
          return send(res, 400, { message: `language must be one of: ${Object.keys(LANGUAGES).join(', ')}` });
        }
        if (typeof code !== 'string' || !code.trim()) return send(res, 400, { message: 'code must be a non-empty string' });
        if (stdin !== undefined && typeof stdin !== 'string') return send(res, 400, { message: 'stdin must be a string' });
        if (Buffer.byteLength(code) > limits.maxCodeBytes) {
          return send(res, 413, { message: `Code is too large to run (max ${limits.maxCodeBytes} bytes)` });
        }
        if (stdin && Buffer.byteLength(stdin) > limits.maxStdinBytes) {
          return send(res, 413, { message: `Input is too large (max ${limits.maxStdinBytes} bytes)` });
        }
        if (imageState[language] !== 'ready') {
          return send(res, 503, { message: `The ${language} runtime is still being prepared. Try again in a minute.` });
        }

        let release;
        try {
          release = await semaphore.acquire();
        } catch (err) {
          if (err instanceof QueueFullError) return send(res, 429, { message: 'The runner is busy. Try again shortly.' });
          throw err;
        }
        try {
          const result = await run({ language, code, stdin: stdin ?? '' });
          return send(res, 200, { language, ...result });
        } finally {
          release();
        }
      }

      return send(res, 404, { message: 'Not found' });
    } catch (err) {
      if (err.status) return send(res, err.status, { message: err.message });
      if (err instanceof DockerUnavailableError) return send(res, 503, { message: 'Code runner is unavailable' });
      if (err instanceof RunnerError) {
        console.error('Runner error:', err.message);
        return send(res, err.code === 'runtime_not_ready' ? 503 : 502, { message: 'Could not run the code right now' });
      }
      console.error('Unhandled error:', err);
      return send(res, 500, { message: 'Internal server error' });
    }
  });
}
