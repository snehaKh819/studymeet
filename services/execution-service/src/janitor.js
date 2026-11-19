import { LABEL } from './sandbox.js';

// Safety net: removes sandbox containers that somehow outlived their run
// (e.g. this service was restarted mid-run).
export function startJanitor(docker, { maxAgeMs, intervalMs = 30_000 }) {
  const sweep = async () => {
    try {
      const filters = encodeURIComponent(JSON.stringify({ label: [`${LABEL}=true`] }));
      const res = await docker.request('GET', `/containers/json?all=1&filters=${filters}`);
      if (res.status !== 200 || !Array.isArray(res.body)) return;
      const cutoff = Date.now() / 1000 - maxAgeMs / 1000;
      for (const c of res.body) {
        if (c.Created < cutoff) await docker.request('DELETE', `/containers/${c.Id}?force=true&v=true`).catch(() => {});
      }
    } catch {
      /* Docker not reachable right now; try again next tick */
    }
  };
  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
