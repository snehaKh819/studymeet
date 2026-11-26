# workspace-service

Coding workspaces for StudyMeet: every participant gets a **personal workspace per room**, and the
owner decides who else can see or edit it. This service owns workspace metadata, ownership,
sharing permissions and the saved code (PostgreSQL). Live sync (Yjs) and code execution are
separate pieces that build on this (see "Planned").

- Port `5004`, reached through the gateway at **`/api/workspaces`** (same cookie auth as everything else).
- Own database `studymeet_workspaces` (created automatically on first start).
- Redis is used to know who has joined a room (written by `room-service`).

## Permissions

| Who | PRIVATE | VIEW_ONLY | COLLABORATIVE |
|---|---|---|---|
| Owner | view, edit, run, manage | view, edit, run, manage | view, edit, run, manage |
| Room member (joined the room) | nothing (404) | view | view |
| Room member granted edit access | nothing (404) | view | view, edit, run |
| Anyone who never joined the room | nothing (404) | nothing (404) | nothing (404) |

Every response includes a `permissions` object: `{ isOwner, canView, canEdit, canRun, canManage }`.
**The frontend should use it to enable or disable buttons, but the server always enforces it.**

## API

All endpoints need the login cookie. Errors look like `{ "message": "..." }`.

| Method & path | Who | What |
|---|---|---|
| `POST /api/workspaces` `{ roomId, name?, language?, createNew? }` | room member | Return my latest workspace (200), or create one if none exists (201); set `createNew: true` to create another (201) |
| `GET /api/workspaces?roomId=` | room member | My workspaces + every non-private workspace in the room (no `code` in the list) |
| `GET /api/workspaces/:id` | anyone who can view | One workspace, including `code` |
| `PATCH /api/workspaces/:id` `{ name?, language?, sharingMode? }` | owner | Rename, change language, change sharing mode |
| `PUT /api/workspaces/:id/code` `{ code }` | `canEdit` | Save code (max 200,000 chars) |
| `POST /api/workspaces/:id/run` `{ code?, stdin? }` | `canRun` | Run the workspace's code in the sandbox (see below) |
| `DELETE /api/workspaces/:id` | owner | Delete (204) |
| `GET /api/workspaces/participants?roomId=` | room member | People who joined the room: `[{ userId, username, isMe }]` (for the "share with..." picker) |
| `GET /api/workspaces/:id/editors` | owner | Granted editors `[{ userId, username }]` |
| `PUT /api/workspaces/:id/editors/:userId` | owner | Grant edit access (only people in the room) |
| `DELETE /api/workspaces/:id/editors/:userId` | owner | Revoke (204) |

`language`: `python` or `javascript`. `sharingMode`: `PRIVATE`, `VIEW_ONLY` or `COLLABORATIVE`.
Edit grants only take effect in `COLLABORATIVE` mode, and they are kept if the owner switches modes.

Workspace shape:

```json
{
  "id": "uuid", "roomId": "uuid", "ownerId": "uuid", "ownerName": "alice",
  "name": "Untitled", "language": "python", "sharingMode": "PRIVATE",
  "createdAt": "...", "updatedAt": "...",
  "permissions": { "isOwner": true, "canView": true, "canEdit": true, "canRun": true, "canManage": true },
  "code": "only on single-workspace responses"
}
```

Status codes: `400` bad input, `401` not logged in, `403` you can see it but not do that (or you haven't
joined the room), `404` doesn't exist **or you may not see it** (deliberately the same), `413` code too big.

Typical frontend flow: join the room (LiveKit) -> `POST /api/workspaces {roomId}` to load or create the
default workspace -> use `createNew: true` to create another -> open one with `GET /:id` -> `PUT /:id/code` to save.

## Running code

`POST /api/workspaces/:id/run` runs the workspace in its selected language. Optional body: `code` (saves it
first, then runs that - needs edit access) and `stdin` (text fed to `input()` / stdin). Response:

```json
{ "language": "python",
  "result": { "stdout": "hello\n", "stderr": "", "exitCode": 0, "timedOut": false,
              "oomKilled": false, "truncated": false, "durationMs": 120 } }
```

`timedOut` = killed after 10 s, `oomKilled` = exceeded 128 MB, `truncated` = output cut at 64 KB.
Errors: `403` no run permission, `400` nothing to run, `413` code too big (runs are limited to ~90 KB),
`429` already running one / more than 20 runs a minute, `503` runner unavailable or runtime still downloading.
A run takes up to ~10 s, so show a spinner and disable the Run button while waiting.

## Room membership (contract with room-service)

`room-service` `POST /join` records `HSET room:<roomId>:members <userId> <displayName>` with a 12 h TTL.
"Joined the room" means that key exists. Display name = the LiveKit identity (username, else email).

## Live collaboration (Yjs over Socket.IO)

Same service, same permission rules (`src/lib/permissions.js`): the server checks them on **every** incoming
update, so a view-only user cannot change anything even with a modified frontend.

- Connect: Socket.IO at path **`/collab/socket.io`** (through the gateway, cookie auth - nothing extra to send).
- One Yjs document per workspace; its text is `doc.getText('code')`.
- The server seeds the document from the saved code, saves it to PostgreSQL every ~2 s while it changes (and on
  shutdown), and unloads it 30 s after the last person leaves.
- A REST save (`PUT /code`) or `run` with `{ code }` while people are editing is applied as a normal edit, so
  everyone converges; `GET /:id` and Run use the live text.

**Frontend: copy `client/collabProvider.js` into the frontend and use it** (`npm i yjs y-protocols lib0 socket.io-client`):

```js
import { createCollabSocket, WorkspaceCollab, watchRoom } from './lib/collabProvider';

const socket = createCollabSocket();                                   // once per page
const collab = new WorkspaceCollab(socket, workspaceId, { user: { name: username, color: '#e91e63' } });
collab.on('synced', ({ permissions }) => { /* bind the editor now */ });
new MonacoBinding(collab.text, editor.getModel(), new Set([editor]), collab.awareness);   // y-monaco
editor.updateOptions({ readOnly: collab.readOnly });                   // refresh on collab.on('permissions')
collab.on('presence', (users) => ...);   // [{ userId, username, mode: 'viewing'|'editing', connections }]
collab.on('run:started' | 'run:result' | 'run:error', ...);           // output from whoever pressed Run
collab.on('revoked' | 'deleted', ...);                                 // lost access / workspace deleted
await collab.requestEditAccess();                                      // viewer -> owner
watchRoom(socket, roomId, () => refetchSharedWorkspaces());            // keeps the Shared Workspaces list live
collab.destroy();                                                      // when the panel closes
```

Do not put starting text into `collab.doc` yourself - the server provides it. Reconnects are automatic and any
offline edits are merged.

Server events (the client class handles these for you): `ws:join` `ws:leave` `yjs:update` `awareness:update`
`room:subscribe` `edit:request` (client -> server, all with acknowledgements) and `yjs:update` `awareness:update`
`presence:update` `permissions:update` `workspace:updated` `workspace:deleted` `ws:revoked` `run:started`
`run:result` `run:error` `edit:requested` (owner only) `workspaces:changed` (server -> client).

`GET /api/workspaces?roomId=` also returns `presence: { activeUsers, ownerOnline }` per workspace for the
"live sharing" badges.

Limits: 256 KB per update, 300 updates/s per connection, document trimmed to 200,000 characters.
Presence lives in Redis (`presence:ws:<id>`) and expires by itself if a server dies.

## Run / test

```bash
# inside Docker Compose it starts automatically (ensures DB, runs migrations, starts)
# tests need Postgres + Redis running:
JWT_SECRET=test DATABASE_URL=postgresql://postgres:password@localhost:5433/studymeet_workspaces \
REDIS_HOST=localhost npm test
```

Env vars: `PORT` (5004), `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `USER_AUTH_URL` (`http://user-auth:5001`), `EXECUTION_URL` (`http://execution-service:5005`).
