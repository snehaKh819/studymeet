import http from 'node:http';

export class DockerUnavailableError extends Error {}

// Tiny client for the Docker Engine HTTP API (unix socket, or tcp:// for a socket proxy).
export class DockerClient {
  constructor({ socketPath = '/var/run/docker.sock', host, port } = {}) {
    this.conn = host ? { host, port } : { socketPath };
  }

  static fromEnv(env = process.env) {
    const dh = env.DOCKER_HOST;
    if (dh?.startsWith('tcp://')) {
      const url = new URL(dh.replace('tcp://', 'http://'));
      return new DockerClient({ host: url.hostname, port: Number(url.port || 2375) });
    }
    return new DockerClient({ socketPath: env.DOCKER_SOCKET || '/var/run/docker.sock' });
  }

  // Opens a request and resolves with the raw response stream (for logs / pulls).
  open(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = http.request(
        {
          ...this.conn,
          method,
          path,
          headers: payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : { 'Content-Length': 0 },
        },
        resolve
      );
      req.on('error', (err) => reject(new DockerUnavailableError(`Docker unreachable: ${err.message}`)));
      req.end(payload);
    });
  }

  // Buffered request: resolves { status, body } (body parsed as JSON when possible).
  async request(method, path, body) {
    const res = await this.open(method, path, body);
    const chunks = [];
    for await (const chunk of res) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* plain text (e.g. /_ping) */
    }
    return { status: res.statusCode, body: parsed };
  }

  async ping() {
    const { status } = await this.request('GET', '/_ping');
    return status === 200;
  }
}
