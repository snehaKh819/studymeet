// A fake Docker Engine API server (unix socket) so the runner's request sequence,
// log demultiplexing, timeout/kill and cleanup logic can be tested without Docker.
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const frame = (type, text) => {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return [header, payload];
};

export async function startFakeEngine(scenario = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fake-docker-'));
  const socketPath = path.join(dir, 'docker.sock');
  const requests = []; // "METHOD /path"
  const bodies = {}; // parsed JSON bodies by "METHOD /path"
  const container = { exited: false, exitCode: scenario.exitCode ?? 0, waiters: [], logRes: null, flood: null };

  const exit = (code) => {
    if (container.exited) return;
    container.exited = true;
    container.exitCode = code;
    clearInterval(container.flood);
    container.logRes?.end();
    container.waiters.splice(0).forEach((res) => json(res, 200, { StatusCode: code }));
  };
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const [pathname, query = ''] = req.url.split('?');
      requests.push(`${req.method} ${pathname}`);
      const raw = Buffer.concat(chunks).toString();
      if (raw) bodies[`${req.method} ${pathname}`] = JSON.parse(raw);

      if (pathname === '/_ping') {
        res.writeHead(200);
        return res.end('OK');
      }
      if (req.method === 'GET' && pathname.startsWith('/images/')) {
        return json(res, scenario.imageMissing ? 404 : 200, scenario.imageMissing ? { message: 'No such image' } : {});
      }
      if (req.method === 'POST' && pathname === '/images/create') {
        res.writeHead(200);
        return res.end('{"status":"Pulling"}\n{"status":"Done"}\n');
      }
      if (req.method === 'POST' && pathname === '/containers/create') {
        if (scenario.noImage) return json(res, 404, { message: 'No such image' });
        return json(res, 201, { Id: 'abc123' });
      }
      if (req.method === 'POST' && pathname === '/containers/abc123/start') {
        json(res, 204);
        if (!scenario.hang && !scenario.flood) setTimeout(() => exit(scenario.exitCode ?? 0), 30);
        return;
      }
      if (req.method === 'GET' && pathname === '/containers/abc123/logs') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.docker.raw-stream' });
        container.logRes = res;
        for (const [type, text] of scenario.output ?? []) for (const part of frame(type, text)) res.write(part);
        if (scenario.flood) {
          container.flood = setInterval(() => {
            for (const part of frame(1, 'x'.repeat(10_000))) res.write(part);
          }, 5);
        }
        if (container.exited) res.end();
        return;
      }
      if (req.method === 'POST' && pathname === '/containers/abc123/wait') {
        if (container.exited) return json(res, 200, { StatusCode: container.exitCode });
        container.waiters.push(res);
        return;
      }
      if (req.method === 'POST' && pathname === '/containers/abc123/kill') {
        json(res, 204);
        return exit(137);
      }
      if (req.method === 'GET' && pathname === '/containers/abc123/json') {
        return json(res, 200, { State: { OOMKilled: Boolean(scenario.oom), ExitCode: container.exitCode } });
      }
      if (req.method === 'DELETE' && pathname === '/containers/abc123') return json(res, 204);
      return json(res, 404, { message: `unhandled ${req.method} ${req.url}` });
    });
  });

  await new Promise((resolve) => server.listen(socketPath, resolve));
  return {
    socketPath,
    requests,
    bodies,
    async close() {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
