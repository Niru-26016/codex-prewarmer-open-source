# Optional Cloud Run job runner

Cloud Run is an alternative to the VM poller. The Worker dispatches a single container bound to an immutable `JOB_ID`; the container claims and finishes that exact job through the same protocol. It does not claim whichever job happens to be next.

Cloud Run requires a billing-enabled project. Builds, Artifact Registry, Secret Manager, logs and execution can incur charges even within advertised free allowances. Review costs and permissions before creating or deploying resources. This repository ships templates; it does not provision them automatically.

## Prepare private infrastructure

1. Select your own project and region. Build `runner/Dockerfile` into a private registry using `cloudbuild.yaml`. The Dockerfile pins Node and Codex versions; resolve the base image to an immutable digest and retain build provenance for a release. Test the resulting container rather than treating a successful image build as execution proof.
2. Create a dedicated runtime service account with Secret Manager access to **only** the machine bearer it needs. Store the bearer in Secret Manager; never copy Codex `auth.json` into the image, job variables, build context or CI.
3. Adapt `infra/cloud-run-job.yaml`: one task, one CPU, 512 MiB memory, 180-second timeout and `maxRetries: 0`. Use your own HTTPS Worker origin, keep `ALLOW_CODEX_EXECUTION=false`, and map `RUNNER_TOKEN` from a pinned secret version.
4. Create a separate dispatch identity with `run.jobs.run` and `run.jobs.runWithOverrides` scoped to this job. The job ID is an environment override, so ordinary invocation permission alone is insufficient. Review the current definition of `roles/run.jobsExecutorWithOverrides`. The current adapter accepts a dedicated service-account JSON key in a Worker secret; provision and rotate it through trusted secret management. This remains a sensitive standing credential.
5. Set `GCP_PROJECT`, `GCP_REGION` and `GCP_JOB` in the Worker's `production` environment, plus `GCP_SERVICE_ACCOUNT_JSON` as a secret. Provision the four independent app secrets described in [deployment](DEPLOYMENT.md). Keep `DRY_RUN=true`, `ENABLE_LIVE_RUNS=false` and `ALLOW_CODEX_CONNECTION=false`.

## Verify before connecting an account

```sh
npm run deploy:check:production
```

This bundles locally and does not deploy. After reviewing infrastructure costs and configuration, deploy your Worker and job through your approved release process. Submit a dry-run job and verify container execution, its bound job ID, single claim and successful finish. Verify that no Codex inference ran. Test an actual scheduled occurrence separately from Run Now.

The Worker signs a Google OAuth JWT, exchanges it at Google's token endpoint and calls the Cloud Run v2 jobs run endpoint. The execution override contains the non-secret job ID only; the runner bearer comes from Secret Manager. A dispatch acknowledgement is not proof that a container started or finished.

## Explicit live opt-in and recovery

Follow [account connection](DEPLOYMENT.md#5-connect-your-own-codex-account-explicitly) on a trusted computer. Enabling real requests requires `DRY_RUN=false`, `ENABLE_LIVE_RUNS=true`, `ALLOW_CODEX_CONNECTION=true`, runner `ALLOW_CODEX_EXECUTION=true` and a ready account session. Real requests use account allowance and do not prove quota-window behavior.

Keep platform retries disabled: a timeout may happen after an account request or token refresh was accepted. Inspect the external execution before manually retrying an uncertain job or replacing quarantined credentials. Confirm termination, reconnect if necessary, and resume with a dry run after a secret rotation or infrastructure update. GitHub Actions is never the live executor.

Official references: [execute jobs](https://docs.cloud.google.com/run/docs/execute/jobs), [retries](https://docs.cloud.google.com/run/docs/jobs-retries), [IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles), and [OpenAI account authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth).
