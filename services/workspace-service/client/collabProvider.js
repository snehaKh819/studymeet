// Browser (and Node) client for workspace-service's live collaboration.
// Copy this file into the frontend, e.g. frontend/src/lib/collabProvider.js
//
//   npm i yjs y-protocols lib0 socket.io-client
//
//   const socket = createCollabSocket();                         // one per page, cookie auth
//   const collab = new WorkspaceCollab(socket, workspaceId, { user: { name, color } });
//   collab.on('synced', ({ permissions }) => ...);                // ready: bind your editor to collab.text
//   new MonacoBinding(collab.text, model, new Set([editor]), collab.awareness);
//   editor.updateOptions({ readOnly: collab.readOnly });          // and again on collab.on('permissions')
//
// Rules: never insert starting text into collab.doc yourself - the server seeds it.
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { io } from 'socket.io-client';

const REMOTE = Symbol('remote'); // origin of changes that came from the server (never echoed back)
const toU8 = (v) => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null);

export function createCollabSocket({ url, token, path = '/collab/socket.io' } = {}) {
  return io(url, { path, withCredentials: true, auth: token ? { token } : undefined });
}

// Calls onChange whenever a workspace in this room is created / renamed / re-shared / deleted
// (refetch GET /api/workspaces?roomId=... then). Re-subscribes after reconnects. Returns an unsubscribe fn.
export function watchRoom(socket, roomId, onChange) {
  const subscribe = () => socket.emit('room:subscribe', { roomId });
  const handler = (msg) => msg.roomId === roomId && onChange(msg);
  socket.on('workspaces:changed', handler);
  socket.on('connect', subscribe);
  if (socket.connected) subscribe();
  return () => {
    socket.off('workspaces:changed', handler);
    socket.off('connect', subscribe);
    socket.emit('room:unsubscribe', { roomId });
  };
}

export class WorkspaceCollab {
  constructor(socket, workspaceId, { doc, user } = {}) {
    this.socket = socket;
    this.workspaceId = workspaceId;
    this.doc = doc ?? new Y.Doc();
    this._ownsDoc = !doc;
    this.text = this.doc.getText('code');
    this.awareness = new Awareness(this.doc);
    this.workspace = null; // { id, name, language, sharingMode, ownerName, ... }
    this.permissions = null; // { isOwner, canView, canEdit, canRun, canManage }
    this.presence = []; // [{ userId, username, mode: 'viewing' | 'editing', connections }]
    this.synced = false;
    this.closed = false;
    this._listeners = new Map();
    if (user) this.setUser(user);
    this._bind();
  }

  get readOnly() {
    return !this.permissions?.canEdit;
  }

  // Events: 'synced' | 'permissions' | 'workspace' | 'presence' | 'status' ('connected'|'disconnected')
  //         'revoked' | 'deleted' | 'error' | 'run:started' | 'run:result' | 'run:error'
  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach((cb) => cb(data));
  }

  setUser({ name, color }) {
    this.awareness.setLocalStateField('user', { name, color });
  }

  // Viewer -> owner: "please let me edit". Resolves { ok, error? }.
  requestEditAccess() {
    return new Promise((resolve) => this.socket.emit('edit:request', { workspaceId: this.workspaceId }, resolve));
  }

  _bind() {
    const mine = (m) => m?.workspaceId === this.workspaceId;
    const close = (event) => () => {
      this._emit(event);
      this.destroy({ notify: false });
    };

    this._handlers = {
      connect: () => {
        this._emit('status', 'connected');
        this._join();
      },
      disconnect: () => {
        this.synced = false;
        const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
        removeAwarenessStates(this.awareness, others, REMOTE);
        this._emit('status', 'disconnected');
      },
      'yjs:update': (m) => {
        const update = mine(m) && toU8(m.update);
        if (update) Y.applyUpdate(this.doc, update, REMOTE);
      },
      'awareness:update': (m) => {
        const update = mine(m) && toU8(m.update);
        if (update) applyAwarenessUpdate(this.awareness, update, REMOTE);
      },
      'presence:update': (m) => {
        if (!mine(m)) return;
        this.presence = m.users;
        this._emit('presence', m.users);
      },
      'permissions:update': (m) => {
        if (!mine(m)) return;
        this.permissions = m.permissions;
        this._emit('permissions', m.permissions);
      },
      'workspace:updated': (m) => {
        if (m.workspace?.id !== this.workspaceId) return;
        this.workspace = m.workspace;
        this._emit('workspace', m.workspace);
      },
      'ws:revoked': (m) => mine(m) && close('revoked')(),
      'workspace:deleted': (m) => mine(m) && close('deleted')(),
      'run:started': (m) => mine(m) && this._emit('run:started', m),
      'run:result': (m) => mine(m) && this._emit('run:result', m),
      'run:error': (m) => mine(m) && this._emit('run:error', m),
    };
    for (const [event, handler] of Object.entries(this._handlers)) this.socket.on(event, handler);

    // local edit -> server (only after the initial sync, and only if we may edit)
    this._onDocUpdate = (update, origin) => {
      if (origin === REMOTE || !this.synced || this.readOnly) return;
      this.socket.emit('yjs:update', { workspaceId: this.workspaceId, update });
    };
    this.doc.on('update', this._onDocUpdate);

    // local cursor -> server
    this._onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === REMOTE || !this.synced) return;
      const update = encodeAwarenessUpdate(this.awareness, added.concat(updated, removed));
      this.socket.emit('awareness:update', { workspaceId: this.workspaceId, update });
    };
    this.awareness.on('update', this._onAwarenessUpdate);

    if (this.socket.connected) this._join();
  }

  // Runs on every (re)connect: "here is what I have, give me what I'm missing".
  _join() {
    if (this.closed) return;
    this.socket.emit('ws:join', { workspaceId: this.workspaceId, sv: Y.encodeStateVector(this.doc) }, (res) => {
      if (this.closed) return;
      if (!res?.ok) return this._emit('error', { error: res?.error ?? 'unknown' });

      this.workspace = res.workspace;
      this.permissions = res.permissions;
      this.presence = res.presence ?? [];

      const update = toU8(res.update);
      if (update?.length) Y.applyUpdate(this.doc, update, REMOTE);
      const awareness = toU8(res.awareness);
      if (awareness) applyAwarenessUpdate(this.awareness, awareness, REMOTE);
      this.synced = true;

      // edits made while offline: send what the server doesn't have yet
      if (this.permissions.canEdit) {
        const missing = Y.encodeStateAsUpdate(this.doc, toU8(res.sv));
        if (missing.length > 2) this.socket.emit('yjs:update', { workspaceId: this.workspaceId, update: missing });
      }
      if (this.awareness.getLocalState() !== null) {
        const mineOnly = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
        this.socket.emit('awareness:update', { workspaceId: this.workspaceId, update: mineOnly });
      }
      this._emit('synced', { workspace: this.workspace, permissions: this.permissions, presence: this.presence });
    });
  }

  destroy({ notify = true } = {}) {
    if (this.closed) return;
    this.closed = true;
    this.synced = false;
    for (const [event, handler] of Object.entries(this._handlers)) this.socket.off(event, handler);
    this.doc.off('update', this._onDocUpdate);
    if (notify && this.socket.connected) this.socket.emit('ws:leave', { workspaceId: this.workspaceId });
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.awareness.destroy();
    if (this._ownsDoc) this.doc.destroy();
    this._listeners.clear();
  }
}
