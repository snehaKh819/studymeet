import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { computePermissions } from '../lib/permissions.js';
import { getMembers, isMember, roomExists } from '../lib/roomAccess.js';
import redis from '../lib/redis.js';
import { deriveInternalToken } from '../lib/internalToken.js';
import {
  LANGUAGES,
  SHARING_MODES,
  MAX_CODE_LENGTH,
  MAX_NAME_LENGTH,
  isUuid,
} from '../lib/config.js';

const router = Router();
router.use(authenticate);

const serialize = (ws, permissions, { includeCode = false } = {}) => ({
  id: ws.id,
  roomId: ws.roomId,
  ownerId: ws.ownerId,
  ownerName: ws.ownerName,
  name: ws.name,
  language: ws.language,
  sharingMode: ws.sharingMode,
  createdAt: ws.createdAt,
  updatedAt: ws.updatedAt,
  permissions,
  ...(includeCode ? { code: ws.code } : {}),
});

// Loads a workspace and the caller's permissions. Sends the response itself and
// returns null if the workspace doesn't exist OR the caller can't even view it
// (same 404 for both, so ids can't be probed).
async function loadWithAccess(req, res) {
  const { id } = req.params;
  const notFound = () => {
    res.status(404).json({ message: 'Workspace not found' });
    return null;
  };
  if (!isUuid(id)) return notFound();

  const workspace = await prisma.workspace.findUnique({ where: { id }, include: { editors: true } });
  if (!workspace) return notFound();

  const { userId } = req.user;
  const member = workspace.ownerId === userId ? true : await isMember(workspace.roomId, userId);
  const permissions = computePermissions({ workspace, userId, isMember: member });
  if (!permissions.canView) return notFound();

  return { workspace, permissions };
}

const requireOwner = (res, permissions) => {
  if (permissions.isOwner) return true;
  res.status(403).json({ message: 'Only the workspace owner can do this' });
  return false;
};

// --- Who is in the room (used by the "share with…" picker) -----------------
router.get('/participants', async (req, res) => {
  const { roomId } = req.query;
  if (!isUuid(roomId)) return res.status(400).json({ message: 'A valid roomId is required' });
  if (!(await isMember(roomId, req.user.userId))) {
    return res.status(403).json({ message: 'Join the room first' });
  }
  const members = await getMembers(roomId);
  const participants = Object.entries(members).map(([userId, username]) => ({
    userId,
    username,
    isMe: userId === req.user.userId,
  }));
  res.json({ participants });
});

// --- Create (or return the existing) personal workspace for a room --------
router.post('/', async (req, res) => {
  const { roomId, name, language } = req.body ?? {};
  const { userId, displayName } = req.user;

  if (!isUuid(roomId)) return res.status(400).json({ message: 'A valid roomId is required' });
  if (language !== undefined && !LANGUAGES.includes(language)) {
    return res.status(400).json({ message: `language must be one of: ${LANGUAGES.join(', ')}` });
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH)) {
    return res.status(400).json({ message: `name must be 1-${MAX_NAME_LENGTH} characters` });
  }
  if (!(await isMember(roomId, userId))) {
    return res.status(403).json({ message: 'Join the room first' });
  }
  if (!(await roomExists(roomId, req.token))) {
    return res.status(404).json({ message: 'Room not found' });
  }

  const existing = await prisma.workspace.findUnique({
    where: { roomId_ownerId: { roomId, ownerId: userId } },
    include: { editors: true },
  });
  if (existing) {
    const permissions = computePermissions({ workspace: existing, userId, isMember: true });
    return res.status(200).json({ workspace: serialize(existing, permissions, { includeCode: true }) });
  }

  const created = await prisma.workspace.create({
    data: {
      roomId,
      ownerId: userId,
      ownerName: displayName,
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(language !== undefined ? { language } : {}),
    },
    include: { editors: true },
  });
  const permissions = computePermissions({ workspace: created, userId, isMember: true });
  res.status(201).json({ workspace: serialize(created, permissions, { includeCode: true }) });
});

// --- List: my workspace + everyone else's non-private ones in the room -----
router.get('/', async (req, res) => {
  const { roomId } = req.query;
  const { userId } = req.user;
  if (!isUuid(roomId)) return res.status(400).json({ message: 'A valid roomId is required' });
  if (!(await isMember(roomId, userId))) {
    return res.status(403).json({ message: 'Join the room first' });
  }

  const rows = await prisma.workspace.findMany({
    where: { roomId, OR: [{ ownerId: userId }, { sharingMode: { not: 'PRIVATE' } }] },
    include: { editors: true },
    orderBy: { updatedAt: 'desc' },
  });

  const workspaces = rows
    .map((ws) => serialize(ws, computePermissions({ workspace: ws, userId, isMember: true })))
    .sort((a, b) => Number(b.permissions.isOwner) - Number(a.permissions.isOwner));

  res.json({ workspaces });
});

// --- Read one (includes code) ---------------------------------------------
router.get('/:id', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found) return;
  res.json({ workspace: serialize(found.workspace, found.permissions, { includeCode: true }) });
});

// --- Update name / language / sharing mode (owner only) --------------------
router.patch('/:id', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found || !requireOwner(res, found.permissions)) return;

  const { name, language, sharingMode } = req.body ?? {};
  const data = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ message: `name must be 1-${MAX_NAME_LENGTH} characters` });
    }
    data.name = name.trim();
  }
  if (language !== undefined) {
    if (!LANGUAGES.includes(language)) {
      return res.status(400).json({ message: `language must be one of: ${LANGUAGES.join(', ')}` });
    }
    data.language = language;
  }
  if (sharingMode !== undefined) {
    if (!SHARING_MODES.includes(sharingMode)) {
      return res.status(400).json({ message: `sharingMode must be one of: ${SHARING_MODES.join(', ')}` });
    }
    data.sharingMode = sharingMode;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  const updated = await prisma.workspace.update({
    where: { id: found.workspace.id },
    data,
    include: { editors: true },
  });
  res.json({ workspace: serialize(updated, found.permissions) });
});

// --- Save code (anyone with edit permission) -------------------------------
// Live editing will go through the collaboration server; this is the explicit
// "Save" / fallback path. Clearing yjsState makes the live doc re-seed from
// `code` the next time someone opens it, so the two can't disagree.
router.put('/:id/code', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found) return;
  if (!found.permissions.canEdit) {
    return res.status(403).json({ message: 'You do not have edit access to this workspace' });
  }

  const { code } = req.body ?? {};
  if (typeof code !== 'string') return res.status(400).json({ message: 'code must be a string' });
  if (code.length > MAX_CODE_LENGTH) {
    return res.status(413).json({ message: `code is too long (max ${MAX_CODE_LENGTH} characters)` });
  }

  const updated = await prisma.workspace.update({
    where: { id: found.workspace.id },
    data: { code, yjsState: null },
    select: { updatedAt: true },
  });
  res.json({ updatedAt: updated.updatedAt });
});

// --- Run (anyone with run permission) --------------------------------------
// Authorisation happens here; the sandbox itself lives in execution-service and
// only accepts calls carrying a token derived from JWT_SECRET.
const RUN_LOCK_SECONDS = 30; // one run at a time per user
const RUNS_PER_MINUTE = 20;
const EXECUTION_TIMEOUT_MS = 30_000;

router.post('/:id/run', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found) return;
  const { workspace, permissions } = found;
  if (!permissions.canRun) {
    return res.status(403).json({ message: 'You do not have permission to run this workspace' });
  }

  // Optional body: { code } = save this first, then run it; { stdin } = program input.
  const { code, stdin } = req.body ?? {};
  if (stdin !== undefined && typeof stdin !== 'string') {
    return res.status(400).json({ message: 'stdin must be a string' });
  }
  let source = workspace.code;
  if (code !== undefined) {
    if (typeof code !== 'string') return res.status(400).json({ message: 'code must be a string' });
    if (code.length > MAX_CODE_LENGTH) {
      return res.status(413).json({ message: `code is too long (max ${MAX_CODE_LENGTH} characters)` });
    }
    if (!permissions.canEdit) {
      return res.status(403).json({ message: 'You can run the saved code but not change it' });
    }
    source = code;
  }
  if (!source.trim()) return res.status(400).json({ message: 'There is no code to run' });

  const { userId } = req.user;
  const minute = Math.floor(Date.now() / 60_000);
  const countKey = `run:count:${userId}:${minute}`;
  const count = await redis.incr(countKey);
  if (count === 1) await redis.expire(countKey, 120);
  if (count > RUNS_PER_MINUTE) {
    return res.status(429).json({ message: 'Too many runs. Wait a minute and try again.' });
  }
  const lockKey = `run:lock:${userId}`;
  if (!(await redis.set(lockKey, '1', 'EX', RUN_LOCK_SECONDS, 'NX'))) {
    return res.status(429).json({ message: 'You already have code running. Wait for it to finish.' });
  }

  try {
    if (code !== undefined) {
      await prisma.workspace.update({ where: { id: workspace.id }, data: { code, yjsState: null } });
    }

    let response;
    try {
      response = await fetch(`${process.env.EXECUTION_URL || 'http://execution-service:5005'}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': deriveInternalToken(process.env.JWT_SECRET),
        },
        body: JSON.stringify({ language: workspace.language, code: source, stdin }),
        signal: AbortSignal.timeout(EXECUTION_TIMEOUT_MS),
      });
    } catch (err) {
      console.error('execution-service unreachable:', err.message);
      return res.status(503).json({ message: 'The code runner is unavailable right now' });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // pass through the runner's own user-facing errors; hide everything else
      const passThrough = [400, 413, 429, 503].includes(response.status);
      console.error('execution-service responded', response.status, payload.message);
      return res
        .status(passThrough ? response.status : 502)
        .json({ message: passThrough ? payload.message : 'The code runner failed. Try again.' });
    }

    const { stdout, stderr, exitCode, timedOut, oomKilled, truncated, durationMs } = payload;
    res.json({ language: workspace.language, result: { stdout, stderr, exitCode, timedOut, oomKilled, truncated, durationMs } });
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
});

// --- Delete (owner only) ---------------------------------------------------
router.delete('/:id', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found || !requireOwner(res, found.permissions)) return;
  await prisma.workspace.delete({ where: { id: found.workspace.id } });
  res.status(204).end();
});

// --- Editors (owner only) --------------------------------------------------
const listEditors = async (workspaceId) =>
  (await prisma.workspaceEditor.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } })).map(
    (e) => ({ userId: e.userId, username: e.userName })
  );

router.get('/:id/editors', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found || !requireOwner(res, found.permissions)) return;
  res.json({ editors: await listEditors(found.workspace.id) });
});

router.put('/:id/editors/:userId', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found || !requireOwner(res, found.permissions)) return;

  const { userId } = req.params;
  if (!isUuid(userId)) return res.status(400).json({ message: 'Invalid userId' });
  if (userId === found.workspace.ownerId) {
    return res.status(400).json({ message: 'The owner already has full access' });
  }

  const members = await getMembers(found.workspace.roomId);
  if (!members[userId]) {
    return res.status(400).json({ message: 'That user has not joined this room' });
  }

  await prisma.workspaceEditor.upsert({
    where: { workspaceId_userId: { workspaceId: found.workspace.id, userId } },
    create: { workspaceId: found.workspace.id, userId, userName: members[userId] },
    update: { userName: members[userId] },
  });
  res.json({ editors: await listEditors(found.workspace.id) });
});

router.delete('/:id/editors/:userId', async (req, res) => {
  const found = await loadWithAccess(req, res);
  if (!found || !requireOwner(res, found.permissions)) return;

  const { userId } = req.params;
  if (!isUuid(userId)) return res.status(400).json({ message: 'Invalid userId' });

  await prisma.workspaceEditor.deleteMany({ where: { workspaceId: found.workspace.id, userId } });
  res.status(204).end();
});

export default router;
