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
| `POST /api/workspaces` `{ roomId, name?, language? }` | room member | Create **my** workspace for the room, or return the existing one (201 new / 200 existing) |
| `GET /api/workspaces?roomId=` | room member | My workspace + every non-private workspace in the room (no `code` in the list) |
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

Typical frontend flow: join the room (LiveKit) -> `POST /api/workspaces {roomId}` -> `GET ?roomId=` for the
"Shared Workspaces" list -> open one with `GET /:id` -> `PUT /:id/code` to save.

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

## Planned (not built yet)

- Live sync: Yjs over Socket.IO, using `computePermissions()` from `src/lib/permissions.js` so view-only
  users' updates are rejected server-side. Until then clients use `PUT /:id/code`.
- Presence (Redis), and broadcasting run output to everyone viewing a workspace.

## Run / test

```bash
# inside Docker Compose it starts automatically (ensures DB, runs migrations, starts)
# tests need Postgres + Redis running:
JWT_SECRET=test DATABASE_URL=postgresql://postgres:password@localhost:5433/studymeet_workspaces \
REDIS_HOST=localhost npm test
```

Env vars: `PORT` (5004), `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `USER_AUTH_URL` (`http://user-auth:5001`), `EXECUTION_URL` (`http://execution-service:5005`).
