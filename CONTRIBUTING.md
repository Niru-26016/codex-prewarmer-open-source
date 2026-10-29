# Contributing to Codex Prewarmer

Thanks for helping improve the project. Useful contributions include reproducible bug reports, clearer deployment instructions, accessibility fixes and focused changes to scheduling or recovery behavior.

## Before starting

For a substantial feature or architectural change, open an issue describing the problem and proposed approach first. Keep ordinary bug-fix pull requests small enough to review. For a possible vulnerability or exposed credential, follow [SECURITY.md](SECURITY.md) instead of posting sensitive details publicly.

Use synthetic credentials and local infrastructure. You do not need a Codex account to develop or run the test suite. Do not spend cloud resources, invoke a maintainer's deployment or use real account sessions to reproduce an ordinary bug.

## Set up a development copy

```sh
git clone https://github.com/Niru-26016/codex-prewarmer-open-source.git
cd codex-prewarmer-open-source
npm ci
npm run local:setup
npm run types
npm start
```

Use Node.js 22 and npm 10; full verification also requires Python 3.8+ for the installer tests. Local secrets are generated in `.dev.vars`; leave that file untracked and private. The default configuration uses mock execution with real account connection and execution disabled.

## Make and verify a change

1. Create a branch describing the change.
2. Reproduce the problem and inspect the affected flow before editing.
3. Add meaningful regression coverage for behavior changes. Use fake tokens, isolated local services and disposable test state.
4. Run the checks relevant to the changed paths, then the repository's required checks:

```sh
npm run types
npm run check
npx playwright install chromium
npm run test:e2e
```

Do not call an external Codex model from a test. Keep recurring live execution out of GitHub Actions. Do not loosen authentication, origin checks, credential isolation, live gates or claim fencing merely to simplify a test.

## Open a pull request

Explain the concrete problem, the resulting behavior and how you verified it. Include screenshots for visible interface changes, using a local mock deployment without private hostnames, account details or tokens. State any checks you could not run and distinguish mock, browser, device and live-cloud evidence.

Before pushing, inspect both the files and the diff for `.dev.vars`, `.env`, `auth.json`, `runner.json`, private keys, credentials, real deployment identifiers and personal log data. Check that generated dependencies, browser reports and temporary runtime files are not staged. Use GitHub's private commit-email option if you do not want your personal address in public history.

## Reporting a bug

Include the relevant app version or commit, operating system, browser, exact steps, expected behavior and observed result. Share a small sanitized log excerpt when it helps. Do not include passwords, session cookies, bearer tokens, raw authentication files or a private live endpoint.

## License

By submitting a contribution, you agree to license your contribution under the project's [MIT License](LICENSE). Third-party code must retain its original notices and have a compatible license.
