import { Server } from 'socket.io';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { computePermissions } from '../lib/permissions.js';
import { isMember } from '../lib/roomAccess.js';
import { userFromToken, parseCookies } from '../middleware/authenticate.js';
import { MAX_CODE_LENGTH, isUuid } from '../lib/config.js';
import { installHub } from './hub.js';
import * as presence from './presence.js';

const MAX_UPDATE_BYTES = 256 * 1024;
const MAX_AWARENESS_BYTES = 16 * 1024;
const MAX_UPDATES_PER_SECOND = 300;
const HEARTBEAT_MS = 20_000;

const toU8 = (v) => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null);
const wsRoom = (id) => `ws:${id}`;
const roomChannel = (roomId) => `room:${roomId}`;
const meta = (ws) => ({
  id: ws.id,
  roomId: ws.roomId,
  ownerId: ws.ownerId,
  ownerName: ws.ownerName,
  name: ws.name,
  language: ws.language,
  sharingMode: ws.sharingMode,
  updatedAt: ws.updatedAt,
});

/**
 * Live collaboration: one Yjs document per workspace, synced over Socket.IO.
 * Permissions come from the same computePermissions() as the REST API and are
 * enforced here on every incoming update (a view-only client cannot write, even
 * with a hacked frontend).
 */
export function attachCollab(httpServer) {
  // Read at call time so tests can shorten them.
  const saveIntervalMs = () => Number(process.env.COLLAB_SAVE_INTERVAL_MS || 2000);
  const unloadGraceMs = () => Number(process.env.COLLAB_UNLOAD_GRACE_MS || 30_000);

  const io = new Server(httpServer, {
    path: '/collab/socket.io',
    serveClient: false,
    maxHttpBufferSize: 1_000_000,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // No CORS: the browser reaches this through the gateway (same origin).
  });

  const sessions = new Map(); // workspaceId -> session
  const loading = new Map(); // workspaceId -> Promise<session|null>

  // ---------------------------------------------------------------- sessions
  const loadWorkspace = (id) => prisma.workspace.findUnique({ where: { id }, include: { editors: true } });

  async function getSession(id) {
    const existing = sessions.get(id);
    if (existing) {
      clearTimeout(existing.unloadTimer);
      existing.unloadTimer = null;
      return existing;
    }
    if (loading.has(id)) return loading.get(id);

    const promise = (async () => {
      const ws = await loadWorkspace(id);
      if (!ws) return null;

      const doc = new Y.Doc();
      const s = {
        id,
        workspace: ws,
        doc,
        text: doc.getText('code'),
        awareness: new Awareness(doc),
        sockets: new Map(), // socketId -> { socket, permissions }
        awarenessIds: new Map(), // socketId -> Set<clientId> that socket controls
        saveTimer: null,
        unloadTimer: null,
        savePromise: Promise.resolve(),
        dead: false,
      };
      s.awareness.setLocalState(null); // the server itself has no cursor

      if (ws.yjsState) {
        Y.applyUpdate(doc, ws.yjsState, 'load');
      } else if (ws.code) {
        doc.transact(() => s.text.insert(0, ws.code), 'seed');
      }
      attachDocListeners(s);
      // Persist a freshly seeded document right away: its internal ids must be stable
      // across restarts, otherwise reconnecting clients would merge a *second* copy.
      if (!ws.yjsState && ws.code) await flush(s);

      sessions.set(id, s);
      return s;
    })().finally(() => loading.delete(id));

    loading.set(id, promise);
    return promise;
  }

  function attachDocListeners(s) {
    const target = (origin) => {
      const room = io.to(wsRoom(s.id));
      return typeof origin === 'string' && s.sockets.has(origin) ? room.except(origin) : room;
    };

    s.doc.on('update', (update, origin) => {
      if (origin === 'load' || origin === 'seed') return;
      target(origin).emit('yjs:update', { workspaceId: s.id, update });
      scheduleSave(s);
    });

    s.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (typeof origin === 'string') {
        const ids = s.awarenessIds.get(origin) ?? new Set();
        added.forEach((c) => ids.add(c));
        removed.forEach((c) => ids.delete(c));
        s.awarenessIds.set(origin, ids);
      }
      const update = encodeAwarenessUpdate(s.awareness, added.concat(updated, removed));
      target(origin).emit('awareness:update', { workspaceId: s.id, update });
    });
  }

  // ------------------------------------------------------------- persistence
  function scheduleSave(s) {
    if (s.saveTimer || s.dead) return;
    s.saveTimer = setTimeout(() => {
      s.saveTimer = null;
      save(s);
    }, saveIntervalMs());
  }

  // Saves run one after another so an older snapshot can never overwrite a newer one.
  function save(s) {
    s.savePromise = s.savePromise.then(async () => {
      if (s.dead) return;
      try {
        await prisma.workspace.update({
          where: { id: s.id },
          data: { yjsState: Buffer.from(Y.encodeStateAsUpdate(s.doc)), code: s.text.toString() },
        });
      } catch (err) {
        if (err.code === 'P2025') s.dead = true; // workspace was deleted meanwhile
        else {
          console.error('Collab save failed, will retry:', err.message);
          scheduleSave(s);
        }
      }
    });
    return s.savePromise;
  }

  async function flush(s) {
    clearTimeout(s.saveTimer);
    s.saveTimer = null;
    await save(s);
  }

  function scheduleUnload(s) {
    if (s.unloadTimer || s.sockets.size > 0) return;
    s.unloadTimer = setTimeout(() => unload(s), unloadGraceMs());
  }

  async function unload(s) {
    if (s.sockets.size > 0 || sessions.get(s.id) !== s) return;
    await flush(s);
    destroySession(s);
  }

  function destroySession(s) {
    s.dead = true;
    clearTimeout(s.saveTimer);
    clearTimeout(s.unloadTimer);
    s.awareness.destroy();
    s.doc.destroy();
    sessions.delete(s.id);
  }

  // ---------------------------------------------------------------- presence
  async function broadcastPresence(s) {
    try {
      io.to(wsRoom(s.id)).emit('presence:update', { workspaceId: s.id, users: await presence.listPresence(s.id) });
    } catch (err) {
      console.error('Presence broadcast failed:', err.message);
    }
  }

  const presenceInfo = (socket, permissions) => ({
    userId: socket.data.user.userId,
    username: socket.data.user.displayName,
    mode: permissions.canEdit ? 'editing' : 'viewing',
  });

  async function leave(socket, s) {
    if (!s.sockets.delete(socket.id)) return;
    socket.leave(wsRoom(s.id));
    socket.data.joined.delete(s.id);

    const ids = s.awarenessIds.get(socket.id);
    s.awarenessIds.delete(socket.id);
    if (ids?.size) removeAwarenessStates(s.awareness, [...ids], null); // broadcasts "cursor gone"

    await presence.removePresence(s.id, socket.id).catch(() => {});
    await broadcastPresence(s);
    scheduleUnload(s);
  }

  // -------------------------------------------------------------- connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || parseCookies(socket.handshake.headers.cookie).token;
    const user = userFromToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    socket.data.joined = new Set();
    socket.data.bucket = { second: 0, count: 0 };
    next();
  });

  const rateLimited = (socket) => {
    const now = Math.floor(Date.now() / 1000);
    const b = socket.data.bucket;
    if (b.second !== now) Object.assign(b, { second: now, count: 0 });
    return ++b.count > MAX_UPDATES_PER_SECOND;
  };

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(`user:${user.userId}`); // personal channel (e.g. "bob asked for edit access")

    const handler = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        await fn(payload ?? {}, reply);
      } catch (err) {
        console.error('Collab handler error:', err);
        reply({ ok: false, error: 'server_error' });
      }
    };

    // Join a workspace. The client sends its state vector; the reply carries exactly
    // what it is missing, plus the server's vector so it can send back what *we* miss.
    socket.on(
      'ws:join',
      handler(async ({ workspaceId, sv }, reply) => {
        if (!isUuid(workspaceId)) return reply({ ok: false, error: 'not_found' });
        const s = await getSession(workspaceId);
        if (!s) return reply({ ok: false, error: 'not_found' });

        const isOwner = s.workspace.ownerId === user.userId;
        const member = isOwner || (await isMember(s.workspace.roomId, user.userId));
        const permissions = computePermissions({ workspace: s.workspace, userId: user.userId, isMember: member });
        if (!permissions.canView) {
          scheduleUnload(s);
          return reply({ ok: false, error: 'not_found' }); // same answer as "doesn't exist"
        }

        s.sockets.set(socket.id, { socket, permissions });
        socket.data.joined.add(s.id);
        socket.join(wsRoom(s.id));
        await presence.addPresence(s.id, socket.id, presenceInfo(socket, permissions)).catch(() => {});

        reply({
          ok: true,
          workspace: meta(s.workspace),
          permissions,
          update: Y.encodeStateAsUpdate(s.doc, toU8(sv) ?? undefined),
          sv: Y.encodeStateVector(s.doc),
          awareness: encodeAwarenessUpdate(s.awareness, [...s.awareness.getStates().keys()]),
          presence: await presence.listPresence(s.id).catch(() => []),
        });
        broadcastPresence(s);
      })
    );

    socket.on(
      'ws:leave',
      handler(async ({ workspaceId }, reply) => {
        const s = sessions.get(workspaceId);
        if (s) await leave(socket, s);
        reply({ ok: true });
      })
    );

    // A document change. Rejected unless this user currently has edit permission.
    socket.on(
      'yjs:update',
      handler(async ({ workspaceId, update }, reply) => {
        const s = sessions.get(workspaceId);
        const entry = s?.sockets.get(socket.id);
        if (!entry) return reply({ ok: false, error: 'not_joined' });
        if (!entry.permissions.canEdit) return reply({ ok: false, error: 'forbidden' });
        const bytes = toU8(update);
        if (!bytes || bytes.length > MAX_UPDATE_BYTES) return reply({ ok: false, error: 'bad_update' });
        if (rateLimited(socket)) return reply({ ok: false, error: 'rate_limited' });

        try {
          Y.applyUpdate(s.doc, bytes, socket.id);
        } catch {
          return reply({ ok: false, error: 'bad_update' });
        }
        // Keep the document within the same size limit the REST API enforces.
        if (s.text.length > MAX_CODE_LENGTH) {
          s.doc.transact(() => s.text.delete(MAX_CODE_LENGTH, s.text.length - MAX_CODE_LENGTH), null);
        }
        reply({ ok: true });
      })
    );

    // Cursors / selections. Anyone who can view may share theirs.
    socket.on(
      'awareness:update',
      handler(async ({ workspaceId, update }, reply) => {
        const s = sessions.get(workspaceId);
        if (!s?.sockets.has(socket.id)) return reply({ ok: false, error: 'not_joined' });
        const bytes = toU8(update);
        if (!bytes || bytes.length > MAX_AWARENESS_BYTES) return reply({ ok: false, error: 'bad_update' });
        try {
          applyAwarenessUpdate(s.awareness, bytes, socket.id);
        } catch {
          return reply({ ok: false, error: 'bad_update' });
        }
        reply({ ok: true });
      })
    );

    // "Shared Workspaces" list: get told when something in this room changes.
    socket.on(
      'room:subscribe',
      handler(async ({ roomId }, reply) => {
        if (!isUuid(roomId) || !(await isMember(roomId, user.userId))) return reply({ ok: false, error: 'forbidden' });
        socket.join(roomChannel(roomId));
        reply({ ok: true });
      })
    );
    socket.on(
      'room:unsubscribe',
      handler(async ({ roomId }, reply) => {
        socket.leave(roomChannel(roomId));
        reply({ ok: true });
      })
    );

    // A viewer asks the owner for edit access (the owner then grants it via the REST API).
    socket.on(
      'edit:request',
      handler(async ({ workspaceId }, reply) => {
        const s = sessions.get(workspaceId);
        const entry = s?.sockets.get(socket.id);
        if (!entry) return reply({ ok: false, error: 'not_joined' });
        if (entry.permissions.canEdit || entry.permissions.isOwner || s.workspace.sharingMode !== 'COLLABORATIVE') {
          return reply({ ok: false, error: 'not_applicable' });
        }
        const first = await redis.set(`editreq:${s.id}:${user.userId}`, '1', 'EX', 30, 'NX');
        if (!first) return reply({ ok: false, error: 'already_requested' });
        const owners = await io.in(`user:${s.workspace.ownerId}`).fetchSockets();
        if (owners.length === 0) return reply({ ok: false, error: 'owner_offline' });
        io.to(`user:${s.workspace.ownerId}`).emit('edit:requested', {
          workspaceId: s.id,
          workspaceName: s.workspace.name,
          userId: user.userId,
          username: user.displayName,
        });
        reply({ ok: true });
      })
    );

    socket.on('disconnect', async () => {
      for (const id of [...socket.data.joined]) {
        const s = sessions.get(id);
        if (s) await leave(socket, s).catch((err) => console.error('leave failed:', err.message));
      }
    });
  });

  // Keep presence entries fresh while sockets are connected (they expire on their own otherwise).
  const heartbeat = setInterval(async () => {
    for (const s of sessions.values()) {
      for (const [socketId, { socket, permissions }] of s.sockets) {
        await presence.addPresence(s.id, socketId, presenceInfo(socket, permissions)).catch(() => {});
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  // ----------------------------------------- called by the REST routes (hub)
  const impl = {
    // Owner changed sharing mode / grants / name / language: re-evaluate everyone connected.
    async onWorkspaceChanged(id) {
      try {
        const s = sessions.get(id);
        if (!s) return;
        const ws = await loadWorkspace(id);
        if (!ws) return impl.onWorkspaceDeleted(id, s.workspace.roomId);
        s.workspace = ws;

        for (const [socketId, entry] of [...s.sockets]) {
          const { user } = entry.socket.data;
          const member = ws.ownerId === user.userId || (await isMember(ws.roomId, user.userId));
          const permissions = computePermissions({ workspace: ws, userId: user.userId, isMember: member });
          if (!permissions.canView) {
            entry.socket.emit('ws:revoked', { workspaceId: id });
            await leave(entry.socket, s);
          } else {
            entry.permissions = permissions;
            entry.socket.emit('permissions:update', { workspaceId: id, permissions });
            await presence.addPresence(id, socketId, presenceInfo(entry.socket, permissions)).catch(() => {});
          }
        }
        io.to(wsRoom(id)).emit('workspace:updated', { workspace: meta(ws) });
        await broadcastPresence(s);
      } catch (err) {
        console.error('onWorkspaceChanged failed:', err.message);
      }
    },

    async onWorkspaceDeleted(id, roomId) {
      try {
        const s = sessions.get(id);
        if (s) {
          io.to(wsRoom(id)).emit('workspace:deleted', { workspaceId: id });
          io.in(wsRoom(id)).socketsLeave(wsRoom(id));
          for (const { socket } of s.sockets.values()) socket.data.joined.delete(id);
          destroySession(s);
        }
        await presence.clearPresence(id).catch(() => {});
        if (roomId) io.to(roomChannel(roomId)).emit('workspaces:changed', { roomId });
      } catch (err) {
        console.error('onWorkspaceDeleted failed:', err.message);
      }
    },

    async workspacesChanged(roomId) {
      io.to(roomChannel(roomId)).emit('workspaces:changed', { roomId });
    },

    // Explicit "set the content" (REST save): applied as a normal Yjs edit so every
    // connected editor converges, and persisted immediately.
    async replaceCode(id, code) {
      try {
        const s = await getSession(id);
        if (!s) return false;
        if (s.text.toString() !== code) {
          s.doc.transact(() => {
            s.text.delete(0, s.text.length);
            s.text.insert(0, code);
          }, null);
        }
        await flush(s);
        scheduleUnload(s);
        return true;
      } catch (err) {
        console.error('replaceCode failed:', err.message);
        return false;
      }
    },

    getLiveCode(id) {
      const s = sessions.get(id);
      return s && !s.dead ? s.text.toString() : null;
    },

    broadcast(id, event, payload) {
      io.to(wsRoom(id)).emit(event, { workspaceId: id, ...payload });
    },

    async presenceSummaries(workspaces) {
      const entries = await Promise.all(
        workspaces.map(async (w) => {
          const users = await presence.listPresence(w.id).catch(() => []);
          return [w.id, { activeUsers: users.length, ownerOnline: users.some((u) => u.userId === w.ownerId) }];
        })
      );
      return Object.fromEntries(entries);
    },
  };

  installHub(impl);

  async function shutdown() {
    clearInterval(heartbeat);
    await Promise.all([...sessions.values()].map((s) => flush(s)));
    for (const s of [...sessions.values()]) destroySession(s); // stops each document's timers
    httpServer.closeAllConnections?.(); // don't wait for idle keep-alive connections
    // io.close() also closes the HTTP server; never let a stuck connection block shutdown.
    await Promise.race([new Promise((resolve) => io.close(resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }

  return { io, shutdown, sessions };
}
