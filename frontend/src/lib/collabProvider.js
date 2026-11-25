import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { io } from 'socket.io-client';

const REMOTE = Symbol('remote');
const toU8 = (value) => (
  value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : null
);

export function createCollabSocket({ url, token, path = '/collab/socket.io' } = {}) {
  return io(url, {
    path,
    withCredentials: true,
    auth: token ? { token } : undefined,
  });
}

export function watchRoom(socket, roomId, onChange) {
  const subscribe = () => socket.emit('room:subscribe', { roomId });
  const handler = (message) => {
    if (message.roomId === roomId) onChange(message);
  };
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
    this.workspace = null;
    this.permissions = null;
    this.presence = [];
    this.synced = false;
    this.closed = false;
    this._listeners = new Map();
    if (user) this.setUser(user);
    this._bind();
  }

  get readOnly() {
    return !this.permissions?.canEdit;
  }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach((callback) => callback(data));
  }

  setUser({ name, color }) {
    this.awareness.setLocalStateField('user', { name, color });
  }

  requestEditAccess() {
    return new Promise((resolve) => {
      this.socket.emit('edit:request', { workspaceId: this.workspaceId }, resolve);
    });
  }

  _bind() {
    const isForWorkspace = (message) => message?.workspaceId === this.workspaceId;
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
        const remoteClients = [...this.awareness.getStates().keys()]
          .filter((clientId) => clientId !== this.doc.clientID);
        removeAwarenessStates(this.awareness, remoteClients, REMOTE);
        this._emit('status', 'disconnected');
      },
      'yjs:update': (message) => {
        const update = isForWorkspace(message) && toU8(message.update);
        if (update) Y.applyUpdate(this.doc, update, REMOTE);
      },
      'awareness:update': (message) => {
        const update = isForWorkspace(message) && toU8(message.update);
        if (update) applyAwarenessUpdate(this.awareness, update, REMOTE);
      },
      'presence:update': (message) => {
        if (!isForWorkspace(message)) return;
        this.presence = message.users;
        this._emit('presence', message.users);
      },
      'permissions:update': (message) => {
        if (!isForWorkspace(message)) return;
        this.permissions = message.permissions;
        this._emit('permissions', message.permissions);
      },
      'workspace:updated': (message) => {
        if (message.workspace?.id !== this.workspaceId) return;
        this.workspace = message.workspace;
        this._emit('workspace', message.workspace);
      },
      'edit:requested': (message) => {
        if (isForWorkspace(message)) this._emit('edit:requested', message);
      },
      'ws:revoked': (message) => isForWorkspace(message) && close('revoked')(),
      'workspace:deleted': (message) => isForWorkspace(message) && close('deleted')(),
      'run:started': (message) => isForWorkspace(message) && this._emit('run:started', message),
      'run:result': (message) => isForWorkspace(message) && this._emit('run:result', message),
      'run:error': (message) => isForWorkspace(message) && this._emit('run:error', message),
    };
    Object.entries(this._handlers).forEach(([event, handler]) => {
      this.socket.on(event, handler);
    });

    this._onDocUpdate = (update, origin) => {
      if (origin === REMOTE || !this.synced || this.readOnly) return;
      this.socket.emit('yjs:update', { workspaceId: this.workspaceId, update });
    };
    this.doc.on('update', this._onDocUpdate);

    this._onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === REMOTE || !this.synced) return;
      const update = encodeAwarenessUpdate(
        this.awareness,
        added.concat(updated, removed)
      );
      this.socket.emit('awareness:update', { workspaceId: this.workspaceId, update });
    };
    this.awareness.on('update', this._onAwarenessUpdate);

    if (this.socket.connected) {
      this._emit('status', 'connected');
      this._join();
    }
  }

  _join() {
    if (this.closed) return;
    this.socket.emit(
      'ws:join',
      {
        workspaceId: this.workspaceId,
        sv: Y.encodeStateVector(this.doc),
      },
      (response) => {
        if (this.closed) return;
        if (!response?.ok) {
          this._emit('error', { error: response?.error ?? 'unknown' });
          return;
        }

        this.workspace = response.workspace;
        this.permissions = response.permissions;
        this.presence = response.presence ?? [];

        const update = toU8(response.update);
        if (update?.length) Y.applyUpdate(this.doc, update, REMOTE);
        const awareness = toU8(response.awareness);
        if (awareness) applyAwarenessUpdate(this.awareness, awareness, REMOTE);
        this.synced = true;

        if (this.permissions.canEdit) {
          const missing = Y.encodeStateAsUpdate(this.doc, toU8(response.sv));
          if (missing.length > 2) {
            this.socket.emit('yjs:update', { workspaceId: this.workspaceId, update: missing });
          }
        }
        if (this.awareness.getLocalState() !== null) {
          const localAwareness = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
          this.socket.emit('awareness:update', {
            workspaceId: this.workspaceId,
            update: localAwareness,
          });
        }
        this._emit('synced', {
          workspace: this.workspace,
          permissions: this.permissions,
          presence: this.presence,
        });
      }
    );
  }

  destroy({ notify = true } = {}) {
    if (this.closed) return;
    this.closed = true;
    this.synced = false;
    Object.entries(this._handlers).forEach(([event, handler]) => {
      this.socket.off(event, handler);
    });
    this.doc.off('update', this._onDocUpdate);
    if (notify && this.socket.connected) {
      this.socket.emit('ws:leave', { workspaceId: this.workspaceId });
    }
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.awareness.destroy();
    if (this._ownsDoc) this.doc.destroy();
    this._listeners.clear();
  }
}
