export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export type Schedule = {
  id: string;
  days: number[];
  time: string;
  label: string;
  enabled: boolean;
  nextAt: number | null;
};
export type AuthJson = {
  auth_mode: 'chatgpt';
  tokens: { refresh_token: string; access_token: string; [key: string]: unknown };
  [key: string]: unknown;
};
export type Job = {
  id: string;
  source: string;
  scheduleId: string | null;
  status: string;
  createdAt: number;
  scheduledAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  runUrl: string | null;
  dryRun: boolean;
  expiresAt: number;
  dispatchAt: number;
  attempts: number;
  claimHash: string | null;
  authVersion: number;
  receipt: string | null;
  executor: string;
};
export type Credential = { version: number; state: string; blob: unknown | null };
// Wrangler can omit the assets binding when generating environment-specific types.
export type AppEnv = Omit<
  Env,
  'EXECUTOR' | 'APP_ENV' | 'DRY_RUN' | 'ALLOW_CODEX_CONNECTION' | 'ENABLE_LIVE_RUNS'
> & {
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  RUNNER_TOKEN: string;
  AUTH_ENCRYPTION_KEY: string;
  APP_ENV: string;
  DRY_RUN: string;
  EXECUTOR: string;
  ALLOW_CODEX_CONNECTION: string;
  ENABLE_LIVE_RUNS: string;
  GCP_PROJECT?: string;
  GCP_REGION?: string;
  GCP_JOB?: string;
  GCP_SERVICE_ACCOUNT_JSON?: string;
};
