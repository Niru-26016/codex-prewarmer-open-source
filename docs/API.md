# API contract

The PWA and Worker use one origin. All API replies are `Cache-Control: no-store`.

| Route                 | Method         | Authentication                             | Behavior                                                                   |
| --------------------- | -------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `/api/health`         | GET            | None                                       | Liveness only, no account/config information                               |
| `/api/login`          | POST           | Password, exact Origin, JSON               | HttpOnly session cookie and CSRF token                                     |
| `/api/session`        | GET            | Session cookie                             | Current CSRF token                                                         |
| `/api/logout`         | POST           | Cookie, Origin, CSRF                       | Revokes the server-side session and clears cookie                          |
| `/api/status`         | GET            | Cookie                                     | IST schedules, server clock, redacted job history, credential state        |
| `/api/schedules`      | POST           | Cookie, Origin, CSRF, JSON                 | Creates a weekly schedule; at most 24                                      |
| `/api/schedules/:id`  | PATCH / DELETE | Cookie, Origin, CSRF                       | Complete schedule edit or delete                                           |
| `/api/run`            | POST           | Cookie, Origin, CSRF, UUID Idempotency-Key | Queues one run or replays its existing result                              |
| `/api/auth/seed`      | POST           | Cookie, Origin, CSRF, JSON                 | Locked by default; refuses replacement while work is active                |
| `/api/auth/remove`    | POST           | Cookie, Origin, CSRF                       | Deletes encrypted credential material when idle                            |
| `/api/runner/vm-poll` | POST           | Runner bearer, JSON                        | Exact pending job ID and heartbeat; no credentials                         |
| `/api/runner/claim`   | POST           | Runner bearer, JSON                        | Requires exact jobId and fresh 64-character claimToken                     |
| `/api/runner/finish`  | POST           | Runner bearer, original claimToken         | Atomic credential write-back and terminal status; duplicate finish is safe |

The VM polls `POST /api/runner/vm-poll` with its machine bearer and JSON `{allowLive: boolean}`. Discovery returns only the exact pending job ID and records a heartbeat. The VM then uses the same single-use claim/finish protocol. Polling never returns credentials. The authenticated status reply includes `vmRunner` liveness. There is no unbound credential-claim or GitHub execution endpoint. Each Cloud Run container receives its specific job ID. A real claim also requires `allowLive: true`, enabled by the runner's `ALLOW_CODEX_EXECUTION=true` setting.

Schedule fields: `days` is a unique non-empty array, Sunday=0 through Saturday=6; `time` is `HH:MM` in IST; `label` is at most 60 characters; `enabled` is a boolean. An occurrence exactly equal to the current timestamp advances to its next eligible date.

Jobs progress through queued, dispatching/dispatched, running and succeeded/failed. Provider 429 responses retry twice after the initial attempt. Network uncertainty remains claimable until timeout, preventing a second run from overlapping. Scheduled overlaps and occurrences delayed more than five minutes are recorded as skipped.

Requests are bounded by their actual streamed byte count (2 KB login, 4 KB schedule, 120 KB credential/runner). Cookies are Secure in remote deployments and SameSite=Strict everywhere. Only explicitly local loopback development may omit Secure. No wildcard CORS is emitted. Error codes are fixed strings; provider payloads, CLI output, passwords and credentials are never returned as errors.
