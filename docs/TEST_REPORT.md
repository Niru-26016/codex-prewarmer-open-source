# Verification scope

The public source contains deterministic local tests and mocked provider integrations. They do not require a Codex account, a cloud deployment or real model requests. Public-release validation is run from the sanitized source copy; do not substitute private deployment results for your own verification.

Full verification also requires Python 3.8+ for the installer validation tests; the local mock app itself only needs Node and npm.

The sanitized public source was validated locally on **29 October 2026**, using Node 22.23.2 and npm 10.9.8. **62 automated tests passed:** 26 Node tests, 23 local workerd/SQLite tests, five Python installer tests covering 42 parameterized cases, and eight desktop/mobile browser tests. A fresh `npm ci`, formatting, lint, TypeScript, the production frontend build and all three environment deployment dry-runs passed. The dependency audit reported zero vulnerabilities at that time. No cloud deployment, account connection or real model request was used for this public-release validation. These results are not a hosted-service guarantee; re-run the commands below after changes.

## Reproduce the checks

```sh
npm ci
npm run local:setup
npm run types
npm run check
npx playwright install chromium
npm run test:e2e
npm run deploy:check:vm
npm run deploy:check:production
```

`check` runs formatting, lint, TypeScript, Node tests, Python installer validation tests, actual local workerd/SQLite tests, the frontend production build and a staging deployment dry-run. The two other deployment checks bundle their configurations locally without uploading them. The GitHub workflow runs build/test checks on pushes to `main`, pull requests and manual dispatch. It never deploys the app, uploads account sessions or starts a live runner.

## Covered scenarios

- IST/UTC conversion, midnight, Sunday/Monday and week/year boundaries, leap day, disabled and invalid schedules.
- Schedule create/edit/pause/enable/delete, reload, eviction persistence, repeated migrations and legacy import.
- Duplicate or overlapping alarms, delayed occurrences, queue expiration, runner timeout, dispatch failures and bounded provider retries.
- Concurrent manual triggers, idempotency replay, job-bound single-use claims and replay-safe finish callbacks.
- Fake expired/refreshed credentials, encrypted write-back after success/failure, reconnect and quarantine paths. Tests inject synthetic credentials and execution functions; they do not run a real account request.
- Mock Google OAuth and Cloud Run APIs, uncertain dispatch fencing and rejection of GitHub runtime execution.
- Unauthorized requests, session revocation, Origin/CSRF protection, login lockout, streamed body limits, JSON requirements, restrictive headers and no wildcard CORS.
- Desktop and Pixel 7-sized browser flows, mock Run Now/history, locked account connection, logout, keyboard dialog operation, tested WCAG A/AA states, responsive width, manifest and offline reload.

Expected rejection tests may log fixed error codes. Passing tests do not establish an exhaustive security or accessibility guarantee.

## Verify separately on your infrastructure

Local checks do not prove cloud permissions, deployment, TLS, actual provider refresh behavior, VM reboot recovery, physical Android installation or a particular account's quota-window behavior. Container runtime compatibility and Cloud Run execution require their own approved infrastructure test.

A successful real request proves that request completed. The five-hour quota-window effect remains **unproven** without a controlled before/after comparison in the account's usage display. Do not describe a mock history entry, a deployment acknowledgement or a passing browser test as that proof.
