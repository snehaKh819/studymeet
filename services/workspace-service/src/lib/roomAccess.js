import redis from './redis.js';

// Contract with room-service: when a user calls POST /join, room-service does
//   HSET room:<roomId>:members <userId> <displayName>   (+ EXPIRE 12h)
// "Member" therefore means "has joined this room via room-service recently".
export const membersKey = (roomId) => `room:${roomId}:members`;

export async function getMembers(roomId) {
  return redis.hgetall(membersKey(roomId)); // { userId: displayName }
}

export async function isMember(roomId, userId) {
  return (await redis.hexists(membersKey(roomId), userId)) === 1;
}

// Asks user-auth whether the room exists, forwarding the caller's own token.
export async function roomExists(roomId, token) {
  const base = process.env.USER_AUTH_URL || 'http://user-auth:5001';
  const res = await fetch(`${base}/rooms/${roomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`user-auth responded ${res.status}`);
  return true;
}
