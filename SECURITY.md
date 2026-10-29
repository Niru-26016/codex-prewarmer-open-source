# Security policy

Codex Prewarmer handles account sessions and coordinates external requests. Read [the security and recovery documentation](docs/SECURITY.md) before enabling a live runner. Development and tests should use mock execution and synthetic credentials.

## Report a vulnerability privately

If GitHub private vulnerability reporting is enabled for this repository, use **Security → Report a vulnerability**. Describe the affected version, impact, reproduction steps using synthetic data and any suggested mitigation.

If that option is unavailable, do not post exploit details or credentials in a public issue. Open an issue containing only a request for a private reporting channel, with no sensitive technical details, and wait for a maintainer to provide one. This project does not promise a staffed security-response service or a fixed response time.

Never send a real `auth.json`, runner token, dashboard password, session cookie, SSH key or cloud credential as part of a report. A minimal reproduction with fake values is preferred.

## Supported code and scope

Security fixes are considered against the current default branch. There is no separate long-term-support release policy. Operators are responsible for their own cloud permissions, host updates, backups and deployed versions.

Relevant issues include unauthorized credential access, authentication or CSRF bypass, duplicate or unintended live requests, credential-refresh corruption, sensitive logging and isolation failures. A successful model request does not establish quota-window behavior; do not describe an unverified timing effect as a security guarantee.

## If you exposed a credential

Stop live work safely and confirm any running request has ended. Revoke or rotate the affected credential through its provider, then follow the documented recovery procedure. Deleting a file or making a repository private does not revoke a credential or erase copies already made by others. Never reset quarantined credentials merely to retry an uncertain request.
