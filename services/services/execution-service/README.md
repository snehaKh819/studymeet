# execution-service

Runs student code in locked-down, throw-away Docker containers. **Internal only**: it is not exposed
through the gateway, and `/execute` needs an `x-internal-token` header (derived from `JWT_SECRET`, so only
`workspace-service` can call it). Authorisation (who may run what) is decided in `workspace-service`.

## API

`POST /execute` `{ language: "python" | "javascript", code, stdin? }` ->
`{ language, stdout, stderr, exitCode, timedOut, oomKilled, truncated, durationMs }`

`GET /health` -> docker connectivity + per-language runtime status (`checking | pulling | ready | error`).
The first start downloads `python:3.12-alpine`; runs return 503 until it is `ready`.

## What every run gets

| Protection | Setting |
|---|---|
| Network | none (`NetworkMode: none`) |
| Time | killed after 10 s (`EXEC_TIMEOUT_MS`) |
| Memory | 128 MB, swap disabled |
| CPU | 0.5 core |
| Processes | max 64 (stops fork bombs) |
| Filesystem | read-only root; 16 MB `noexec` tmpfs at `/tmp` only |
| User / privileges | `nobody` (65534), all capabilities dropped, `no-new-privileges` |
| Output | stdout+stderr capped at 64 KB, program killed if it floods |
| Code size | 90 KB code, 10 KB stdin |
| Load | 2 runs at once (`MAX_CONCURRENT_RUNS`), 8 queued, then HTTP 429 |
| Cleanup | container force-removed after every run; a janitor removes stragglers |

The code itself reaches the container base64-encoded in an environment variable, never through shell
quoting. The service has **no npm dependencies**: it speaks to the Docker Engine API directly.

## Security note (read before deploying)

This service needs the Docker socket (`/var/run/docker.sock`). Whoever controls it controls the host's Docker,
so it must stay unreachable from the internet and must only be called by `workspace-service`. For a real
deployment either run it on its own machine, or point it at a restricted socket proxy with
`DOCKER_HOST=tcp://docker-proxy:2375` (the client already supports this), and consider gVisor (`runsc`).

## Test

```bash
npm test                                          # unit tests, fake Docker (no Docker needed)
docker compose exec execution-service node scripts/smoke.js   # REAL sandbox checks (needs Docker)
```
