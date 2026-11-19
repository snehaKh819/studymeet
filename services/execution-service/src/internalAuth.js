import { createHmac, timingSafeEqual } from 'node:crypto';

// workspace-service and execution-service both know JWT_SECRET, so they derive
// the same service-to-service token from it (no extra secret to configure).
export function deriveInternalToken(secret) {
  return createHmac('sha256', secret).update('studymeet-internal-execution-v1').digest('hex');
}

export function tokenMatches(expected, provided) {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
