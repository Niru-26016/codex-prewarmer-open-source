# Isolated Linux VM runner

A VM service polls the Worker every ten seconds while idle. It claims one exact job, performs a minimal Codex CLI request when live work is explicitly enabled, writes any refreshed credentials back encrypted, then removes its temporary authentication directory. The phone and laptop need not remain open.

This deployment path currently packages Linux x86_64 binaries and targets a systemd host with Python 3.8+ and an `ubuntu` administration account. Test the distribution and service policy before production use. Docker is not required. The unit uses `LoadCredential`; its credential-directory environment works with systemd 249 and later.

## Build a credential-free release

From a trusted development checkout:

```sh
python3 scripts/package-vm-runner.py
```

The packager downloads the two official archives pinned in `runner/vendor-lock.json`, validates their hashes and packages an allowlist of runtime files. It prints a release ID, archive path and SHA-256. It does not connect an account, execute an inference or deploy anything. Bundled Node and Codex retain their respective upstream licenses; the application license does not relicense them.

Transfer the archive using verified SSH host keys to:

```text
/home/ubuntu/codex-prewarmer-staging/RELEASE/RELEASE.tgz
```

Replace both occurrences of `RELEASE` with the emitted release ID. Review and transfer `infra/install-vm-runner.py` separately. Use your own host and SSH identity; this repository contains no private VM address or key.

## Stage without credentials or activation

Run the reviewed installer on the VM with the exact checksum and your Worker origin:

```sh
sudo python3 install-vm-runner.py RELEASE SHA256 --worker-url https://prewarmer.example.com --stage-only
```

Replace `RELEASE` and `SHA256` with actual packager output. If your archive is staged elsewhere, add `--staging-root /absolute/staging/directory`; the release subdirectory layout remains the same. Staging refuses an active or boot-enabled existing runner. It verifies the archive and each file, installs only the dedicated runner paths, verifies binary versions and the systemd unit, and leaves the service stopped. Existing Docker container health is checked when Docker is present; Docker is optional.

The installer accepts only a plain HTTPS Worker origin. It validates a private configuration against the explicitly supplied origin rather than embedding any maintainer deployment address.

## Provision the machine credential

Use a trusted private transfer to create root-owned `/etc/codex-prewarmer/runner.json` with mode 0600 inside a root-only mode-0700 directory. The file's structure is:

```json
{
  "WORKER_URL": "https://prewarmer.example.com",
  "RUNNER_TOKEN": "REPLACE_WITH_THE_TARGET_WORKERS_RANDOM_RUNNER_TOKEN",
  "ALLOW_CODEX_EXECUTION": "false"
}
```

The placeholder is not a working credential. Use the same independently generated bearer as the target Worker's `RUNNER_TOKEN` secret. Do not put the real value in a shell argument, repository, transcript or log. The service manager exposes a protected read-only copy only to the runner identity. No persistent Codex `auth.json` belongs on the VM.

Start the staged service explicitly after the configuration is present:

```sh
sudo systemctl enable --now codex-prewarmer.service
sudo systemctl show codex-prewarmer.service -p ActiveState -p SubState -p UnitFileState -p NRestarts
sudo journalctl -u codex-prewarmer.service --since '10 minutes ago'
```

Use the target Worker's VM environment with `DRY_RUN=true` and `ENABLE_LIVE_RUNS=false`. Confirm ONLINE in Settings, then submit a dry-run job. The VM follows the real claim/finish path while the mock job makes no Codex request. Inspect its terminal status before considering account connection.

After [explicit account setup](DEPLOYMENT.md#5-connect-your-own-codex-account-explicitly), live execution requires the Worker gates and `ALLOW_CODEX_EXECUTION=true` together. Restart the drained service after changing its private configuration; the daemon reads it at startup.

## Isolation and capacity

The provided unit uses a dynamic unprivileged identity, strict filesystem protections, a private temporary directory, hidden home directories, no core dumps and one job at a time. Its limits are 256 MiB RAM, 512 MiB swap and 25% CPU. These are starting limits for tiny requests, not a capacity guarantee. Measure your own account/model workload and leave host headroom. If the host has little RAM, configure swap using your operating system's documented procedure and verify boot persistence before relying on it.

The runner pins a separate Node runtime rather than modifying system Node. Inspect cgroup memory and swap counters if the systemd version does not expose peak metrics. Example operational checks:

```sh
sudo systemctl show codex-prewarmer.service -p MemoryCurrent -p MemoryMax -p MemorySwapMax -p NRestarts
sudo journalctl -u codex-prewarmer.service --since '1 hour ago'
```

Logs contain fixed status codes, not Codex output or tokens. Restrict host administration and journal access. The machine bearer is a sensitive standing credential, even though it is not the account session itself.

## Drain, update or migrate

Ask only the main daemon to stop polling, allowing an in-flight request and its finish callback to complete:

```sh
sudo systemctl kill --kill-who=main --signal=SIGTERM codex-prewarmer.service
sudo systemctl show codex-prewarmer.service -p ActiveState -p SubState -p MainPID
```

Wait for an inactive service with `MainPID=0` and no active dashboard job. A direct stop while work is active can signal the entire process group and interrupt account refresh/write-back. Replace credentials or releases only after draining. The installer refuses overwriting a release ID; build a new release for an update. A normal install enables startup but does not restart an already running process.

For a host migration, prepare the replacement with `--stage-only`, provision only its machine credential, drain and disable the old service, then enable the new one. Never run both intentionally. The shared dashboard heartbeat cannot identify which host polled; verify the new host's journal as well. Preserve Worker state and encryption secrets. Copy no temporary `auth.json`. Stop the new host before any rollback to the old one.

Rotate the bearer only after old work has finished; otherwise a pending callback may be rejected. If credentials are quarantined, confirm the external process has ended before reconnecting. Do not silently reseed an old authentication file to retry an uncertain request.

## Timing and failure limits

Queued jobs expire after ten minutes. An occurrence noticed by Cloudflare more than five minutes late is recorded as skipped. Another alarm arriving during an active job is also skipped. The CLI has a two-minute timeout, while the claimed job's safety deadline is three minutes. Polling, provider latency and outages can delay execution; the next-run countdown is not a precise execution-time or quota-reset guarantee.

An enabled systemd unit is configured for startup, but you must separately test reboot recovery on your own host. See [architecture](ARCHITECTURE.md) and [security](SECURITY.md) for failure and trust boundaries.
