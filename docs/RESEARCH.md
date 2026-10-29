# Design references

These primary documentation links explain the platform choices. They are not proof that a particular deployment, account or quota-window behavior works. Review current provider documentation before changing a pinned runtime, permissions or infrastructure.

- [OpenAI authentication](https://learn.chatgpt.com/docs/auth) and [ChatGPT-managed automation](https://learn.chatgpt.com/docs/auth/ci-cd-auth): supported login, cached credentials, normal CLI refresh and private execution infrastructure. Prewarmer delegates refresh to the CLI and persists the resulting file encrypted; it does not implement a private OAuth refresh endpoint.
- [Non-interactive Codex](https://learn.chatgpt.com/docs/non-interactive-mode): `codex exec` runs a script-driven task, and `--ephemeral` avoids persisting session rollout files on the runner. This is separate from opening a normal ChatGPT browser conversation.
- [Cloudflare Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): at-least-once alarms and one alarm per object motivate persisted occurrence keys and rearming the earliest deadline.
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) and [Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/): generated runtime types, bounded requests and tests using actual local workerd/SQLite.
- [Cloud Run execution](https://docs.cloud.google.com/run/docs/execute/jobs), [IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles) and [retry behavior](https://docs.cloud.google.com/run/docs/jobs-retries): per-execution job binding, least privilege and zero platform retries for uncertain personal-account operations.
- [GitHub additional product terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features): hosted Actions compute is reserved here for build/test CI. The application has no recurring runtime workflow. Pull requests, pushes to `main` and manual dispatch run build/test CI only.

No referenced source establishes that a tiny scheduled request will reliably start or reset an account's five-hour quota window. Treat that behavior as a hypothesis requiring account-specific live evidence, not a feature guarantee or a way to bypass usage limits.
