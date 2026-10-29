# Deploy your own instance

Prewarmer is a single-owner application. Start with a mock deployment, validate scheduling, then choose an isolated VM or optional Cloud Run runner. The repository contains no hosted demo, production account, infrastructure identifiers or credentials for you to reuse.

Cloud provider resources and runner usage may incur charges. Review the providers' current plans and your account's terms before provisioning. The commands below are instructions for your own approved infrastructure; local validation does not deploy anything.

## 1. Prepare the application

Use the Node and npm versions declared in `.nvmrc` and `package.json`:

```sh
npm ci
npm run local:setup
npm run types
npm run check
npx playwright install chromium
npm run test:e2e
```

`local:setup` creates a private, Git-ignored `.dev.vars` file for local development. Use separate values for every remote environment. Do not upload this local file, personal authentication files, build caches or screenshots containing private account data.

Review `wrangler.jsonc`. Give each environment a distinct Worker name in your own Cloudflare account. All shipped environments have `DRY_RUN=true`, `ENABLE_LIVE_RUNS=false` and `ALLOW_CODEX_CONNECTION=false`. Staging uses `mock`; the VM template uses `vm`; the optional production template uses `cloud_run`.

## 2. Create independent remote secrets

Authenticate Wrangler to your own Cloudflare account using its supported login flow. Provision these four secrets separately for the environment you plan to deploy:

| Secret                | Purpose                                      | Required value                                                                                       |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`      | Unlocks the dashboard                        | Independently generated high-entropy password; 48 random hexadecimal characters is a suitable format |
| `SESSION_SECRET`      | Signs sessions and login address identifiers | At least 32 cryptographically random bytes                                                           |
| `RUNNER_TOKEN`        | Authorizes the machine runner                | At least 32 cryptographically random bytes, encoded as a long string                                 |
| `AUTH_ENCRYPTION_KEY` | Encrypts account credentials                 | Exactly 32 random bytes encoded as base64                                                            |

Generate and store these values in a trusted password or secret manager. Use Wrangler's hidden interactive prompts rather than command-line arguments:

```sh
npx wrangler secret put ADMIN_PASSWORD --env staging
npx wrangler secret put SESSION_SECRET --env staging
npx wrangler secret put RUNNER_TOKEN --env staging
npx wrangler secret put AUTH_ENCRYPTION_KEY --env staging
```

Replace `staging` with `vm` or `production` for a different target and provision independent values. Do not print values into logs or put secrets in the repository. The runner's bearer must match `RUNNER_TOKEN` on its target Worker.

## 3. Validate a hosted mock instance

```sh
npm run deploy:check
npx wrangler deploy --env staging
```

The first command bundles a dry-run deployment locally. The second deploys to your account. Use your own HTTPS origin, represented throughout these guides by `https://prewarmer.example.com`.

Unlock the dashboard with that environment's password. Create a schedule a few minutes ahead, close the dashboard, and reopen it after the occurrence. Confirm the mock run in History, next occurrence, editing, pause/resume, deletion and logout. Test Run Now separately. Mock completion makes no Codex request and proves neither a real runner nor quota behavior.

## 4. Add an execution runner without connecting an account

For the VM path, provision the four secrets for `vm`, review the Worker name, then run:

```sh
npm run deploy:check:vm
npx wrangler deploy --env vm
```

Keep all live gates disabled. Follow [the VM guide](VM_RUNNER.md) to install a runner with `ALLOW_CODEX_EXECUTION=false`. Check ONLINE status and verify a dry-run job through the actual VM. This deployment uses its own state and origin; do not expect the staging mock instance's schedules to appear automatically.

For an optional job-container deployment, follow [the Cloud Run guide](CLOUD_RUN.md). Its IAM, registry, image and billing setup require separate review.

## 5. Connect your own Codex account explicitly

Account connection is a separate sensitive step. Read [OpenAI's authentication guidance](https://learn.chatgpt.com/docs/auth) and [ChatGPT-managed automation guidance](https://learn.chatgpt.com/docs/auth/ci-cd-auth) before using a personal session on trusted infrastructure. An API key and a ChatGPT-managed Codex account have different usage and billing behavior; this app's seed helper accepts file-backed ChatGPT authentication.

Drain and stop any existing runner before replacing its account session. Keep `DRY_RUN=true` and `ENABLE_LIVE_RUNS=false`; change only `ALLOW_CODEX_CONNECTION` to `true` in the chosen environment and deploy it. On a trusted computer with the official Codex CLI installed, create a dedicated authentication directory:

```sh
mkdir -p .build/codex-connection
chmod 700 .build/codex-connection
CODEX_HOME="$PWD/.build/codex-connection" codex -c 'cli_auth_credentials_store="file"' login
```

Complete the supported sign-in flow using your own account. The directory is ignored by Git. Review your HTTPS destination, then upload through the helper:

```sh
node scripts/seed-auth.mjs https://prewarmer.example.com .build/codex-connection/auth.json --allow-credential-upload
```

Enter the dashboard password in its hidden prompt. The helper first checks that the target permits connections; it uploads over HTTPS, and the Worker encrypts the session at rest. Account upload itself does not make an inference request. Confirm CONNECTED in Settings.

Never paste `auth.json` into chat, a public issue, a repository or CI. Do not use this dedicated session concurrently for unrelated Codex work. Normal CLI refresh may replace its tokens; the runner writes updated credentials back encrypted. A revoked or unrecoverable session still requires reconnection.

## 6. Opt in to one real verification

Only after reviewing the account, runner and destination, set all required gates on the chosen deployment:

| Location                     | Setting                       |
| ---------------------------- | ----------------------------- |
| Worker                       | `DRY_RUN=false`               |
| Worker                       | `ENABLE_LIVE_RUNS=true`       |
| Worker                       | `ALLOW_CODEX_CONNECTION=true` |
| Runner private configuration | `ALLOW_CODEX_EXECUTION=true`  |
| Stored account               | Credential state `ready`      |

Deploy the Worker changes and restart only the drained runner service. Use Run Now once; inspect the job status and the runner journal. A successful request consumes some account allowance and proves execution. It does **not** establish that a five-hour quota window started or reset. Record any quota-window experiment separately using before/after account usage evidence.

## Operations and recovery

Keep the same Worker identity, Durable Object binding, SQLite namespace and encryption key when updating an existing deployment. Changing the target name can create a separate application state. Replacing `AUTH_ENCRYPTION_KEY` makes existing encrypted credentials unreadable. Back up and review migrations before upgrading a populated instance.

Turn off live work with `DRY_RUN=true` or `ENABLE_LIVE_RUNS=false`. A request already accepted by Codex cannot be undone; allow its finish callback to preserve refreshed credentials. Stop the old runner before starting a replacement. Follow [security and recovery](SECURITY.md) for quarantine, reconnect and key rotation.

Installing the PWA does not create Android system alarms. Cloudflare schedules the work, and the execution host must remain reachable. Browser viewport tests do not prove physical-device installation, provider availability or exact trigger timing.
