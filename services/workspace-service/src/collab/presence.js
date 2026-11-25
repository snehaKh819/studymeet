import redis from '../lib/redis.js';

// Who is looking at / editing which workspace right now (Redis, so it can be
// shared across instances and expires by itself if a server dies).
//   presence:ws:<workspaceId>  ->  hash  socketId => {"userId","username","mode","at"}
const key = (workspaceId) => `presence:ws:${workspaceId}`;
const KEY_TTL_SECONDS = 90;
const STALE_MS = 60_000; // ignore entries nobody refreshed for a minute

export async function addPresence(workspaceId, socketId, info) {
  await redis
    .multi()
    .hset(key(workspaceId), socketId, JSON.stringify({ ...info, at: Date.now() }))
    .expire(key(workspaceId), KEY_TTL_SECONDS)
    .exec();
}

export async function removePresence(workspaceId, socketId) {
  await redis.hdel(key(workspaceId), socketId);
}

export async function clearPresence(workspaceId) {
  await redis.del(key(workspaceId));
}

// One entry per user (a user with two tabs counts once); "editing" wins over "viewing".
export async function listPresence(workspaceId) {
  const all = await redis.hgetall(key(workspaceId));
  const now = Date.now();
  const byUser = new Map();
  for (const raw of Object.values(all)) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (now - entry.at > STALE_MS) continue;
    const existing = byUser.get(entry.userId);
    if (!existing) {
      byUser.set(entry.userId, { userId: entry.userId, username: entry.username, mode: entry.mode, connections: 1 });
    } else {
      existing.connections += 1;
      if (entry.mode === 'editing') existing.mode = 'editing';
    }
  }
  return [...byUser.values()].sort((a, b) => a.username.localeCompare(b.username));
}
