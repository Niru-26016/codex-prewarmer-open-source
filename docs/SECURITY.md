# Security and recovery

This is a single-owner app. The `personal` Durable Object is the coordination boundary for that account. A future multi-user service must use one isolated object and independent authorization per owner.

## Defaults

- Every shipped environment has `DRY_RUN=true`, `ENABLE_LIVE_RUNS=false` and `ALLOW_CODEX_CONNECTION=false`. Local/staging use `mock`; optional runner templates select `vm` or `cloud_run` without enabling live work.
- The shipped app cannot upload real Codex credentials or make Codex requests.
- No GitHub runtime job exists. Actions is manual build/test CI only.
- Local passwords and keys are generated separately, ignored by Git, and saved with mode 0600. They are not cloud credentials.
- Remote authentication uses a random high-entropy dashboard password in a Worker secret, server-side revocable sessions, HttpOnly/Secure/SameSite=Strict cookies, exact Origin checks and per-session CSRF tokens.
- Login is limited to eight failed attempts per network address and 100 globally in 15 minutes. Address keys are HMACs; raw addresses are not persisted. Session signing-secret rotation invalidates all sessions. Five sessions are retained per owner.
- Credentials use random-nonce AES-256-GCM encryption. The encryption key lives separately from the SQLite data. Responses never expose stored credential material to the PWA.

## Execution fencing

A durable outbox records the job before provider dispatch. Manual idempotency keys and schedule occurrence keys prevent duplicate jobs. Dispatching is reserved before external I/O. All state changes use synchronous SQLite transactions where necessary; outbound fetch does not hold the mutation mutex.

Queued claims expire after ten minutes. A claimed runner has three minutes, while the CLI is killed after two minutes and the Cloud Run task must be configured with a three-minute timeout and zero platform retries. Runner credentials are released once per job. A random claim token authenticates completion; duplicate callbacks with the same result are safe. Stored credential versions prevent stale replacement. Credential replacement/disconnect is refused while active.

After an unconfirmed live write-back, credentials are quarantined. No new live run may start until recovery. **Before reconnecting, inspect the VM or Cloud Run host and confirm termination of the previous execution.** Never clear a quarantine merely to retry. A session reimport cannot itself prove an old external process has stopped.

## Trust and limitations

A compromised Worker deployment can decrypt its own credentials. A compromised runner with its bearer secret can claim eligible jobs. Restrict Cloudflare deploy access, Google IAM, repository write permissions and Secret Manager access. The current runner uses a standing bearer rather than identity attestation; rotate it regularly. A Cloud Run invoker key is also sensitive. These are explicit trust boundaries, not end-to-end protection from infrastructure owners.

There is no exactly-once guarantee for an external inference. A network or process failure may happen after a request was accepted. The app fails closed and records uncertainty rather than automatically starting another inference. Occurrences noticed by Cloudflare more than five minutes late are skipped. A job already queued can wait up to ten minutes for its runner.

AES key rotation requires stopping live work, disconnecting credentials, replacing the encryption key, then reconnecting through the trusted helper. Existing ciphertext cannot be read after replacing the key. SQLite migrations preserve old schedules/history and mark legacy credentials for reconnection; take a backup/recovery checkpoint before a production migration. Worker rollback alone does not revert database schema.

Use high-entropy generated passwords; this is not a password-storage service for human-chosen weak passwords. Account MFA and host security are outside this app's control. Cloudflare free limits are finite. Installing the PWA does not create an Android native alarm, push notifications, or guarantee exact execution time.

## Later connection

Review the code and deployment first. Only after owner approval, use a dedicated Codex auth directory and supported CLI login on a trusted computer. Do not change the desktop app's normal Codex authentication configuration. Never paste auth.json into chat, commit it, place it in CI artifacts/caches, or pass it to a public repository.

A successful request is evidence of request completion only. It does not prove that a five-hour quota window started or reset. That requires a separately authorized live test and comparison with the account's usage display.

## Reporting a vulnerability

Follow the root [security policy](../SECURITY.md). Do not publish account files, secret values, private host addresses or exploit details in public issues. A public repository contains application source and example configuration; deployment credentials and account sessions must remain private.
